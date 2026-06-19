using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class ProductFunctions(
    IJsonRepository repository,
    OpenFoodFactsClient openFoodFacts,
    JsonSerializerOptions json)
{
    [Function("GetProducts")]
    public async Task<HttpResponseData> GetProducts(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "products")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var products = await GetProductsAsync(cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, products, json, cancellationToken);
    }

    [Function("PostProduct")]
    public async Task<HttpResponseData> PostProduct(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "products")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var product = await request.ReadJsonAsync<Product>(json, cancellationToken);
        if (product is null || string.IsNullOrWhiteSpace(product.Name))
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Product body is required.", json, cancellationToken);
        }

        var now = DateTimeOffset.UtcNow;
        var saved = product with
        {
            Id = string.IsNullOrWhiteSpace(product.Id) ? Guid.NewGuid().ToString("n") : product.Id,
            CreatedAt = product.CreatedAt == default ? now : product.CreatedAt,
            UpdatedAt = now
        };

        var products = await GetProductsAsync(cancellationToken);
        products.Add(saved);
        await repository.SaveAsync(BlobNames.Products, products, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.Created, saved, json, cancellationToken);
    }

    [Function("PutProduct")]
    public async Task<HttpResponseData> PutProduct(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "products/{id}")] HttpRequestData request,
        string id,
        CancellationToken cancellationToken)
    {
        var product = await request.ReadJsonAsync<Product>(json, cancellationToken);
        if (product is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Product body is required.", json, cancellationToken);
        }

        var products = await GetProductsAsync(cancellationToken);
        var index = products.FindIndex(x => x.Id == id);
        if (index < 0)
        {
            return await request.ErrorAsync(HttpStatusCode.NotFound, "Product was not found.", json, cancellationToken);
        }

        var saved = product with
        {
            Id = id,
            CreatedAt = products[index].CreatedAt,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        products[index] = saved;
        await repository.SaveAsync(BlobNames.Products, products, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, saved, json, cancellationToken);
    }

    [Function("DeleteProduct")]
    public async Task<HttpResponseData> DeleteProduct(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "products/{id}")] HttpRequestData request,
        string id,
        CancellationToken cancellationToken)
    {
        var products = await GetProductsAsync(cancellationToken);
        products.RemoveAll(x => x.Id == id);
        await repository.SaveAsync(BlobNames.Products, products, cancellationToken);
        return request.NoContent();
    }

    [Function("SearchProducts")]
    public async Task<HttpResponseData> SearchProducts(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "products/search")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var query = QueryHelpers.Get(request.Url, "query") ?? "";
        var products = await GetProductsAsync(cancellationToken);

        var results = products
            .Where(product => string.IsNullOrWhiteSpace(query)
                || product.Name.Contains(query, StringComparison.OrdinalIgnoreCase)
                || product.Brand.Contains(query, StringComparison.OrdinalIgnoreCase)
                || product.Barcode.Contains(query, StringComparison.OrdinalIgnoreCase))
            .OrderBy(product => product.Name)
            .ToList();

        return await request.JsonAsync(HttpStatusCode.OK, results, json, cancellationToken);
    }

    [Function("GetProductByBarcode")]
    public async Task<HttpResponseData> GetProductByBarcode(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "products/barcode/{barcode}")] HttpRequestData request,
        string barcode,
        CancellationToken cancellationToken)
    {
        var products = await GetProductsAsync(cancellationToken);
        var local = products.FirstOrDefault(x => x.Barcode == barcode);
        if (local is not null)
        {
            return await request.JsonAsync(HttpStatusCode.OK, local, json, cancellationToken);
        }

        var imported = await openFoodFacts.FindByBarcodeAsync(barcode, cancellationToken);
        if (imported is not null)
        {
            return await request.JsonAsync(HttpStatusCode.OK, imported, json, cancellationToken);
        }

        return await request.JsonAsync(HttpStatusCode.OK, new Product
        {
            Barcode = barcode,
            Source = "manual"
        }, json, cancellationToken);
    }

    private Task<List<Product>> GetProductsAsync(CancellationToken cancellationToken) =>
        repository.GetOrCreateAsync(BlobNames.Products, Defaults.Products, cancellationToken);
}

