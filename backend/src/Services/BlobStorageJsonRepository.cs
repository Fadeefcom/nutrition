using System.Text.Json;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace FitnessDiary.Api.Services;

public sealed class BlobStorageJsonRepository : IJsonRepository
{
    private readonly BlobContainerClient _container;
    private readonly JsonSerializerOptions _json;
    private readonly ILogger<BlobStorageJsonRepository> _logger;

    public BlobStorageJsonRepository(
        IConfiguration configuration,
        JsonSerializerOptions json,
        ILogger<BlobStorageJsonRepository> logger)
    {
        var connectionString = ConfigurationReader.Get(configuration, "BlobStorageConnectionString")
            ?? ConfigurationReader.Get(configuration, "AzureWebJobsStorage")
            ?? throw new InvalidOperationException("Missing BlobStorageConnectionString or AzureWebJobsStorage setting.");
        var containerName = ConfigurationReader.Get(configuration, "BlobContainerName") ?? "fitness-diary";

        _container = new BlobContainerClient(connectionString, containerName);
        _json = json;
        _logger = logger;
    }

    public async Task<T?> GetAsync<T>(string blobName, CancellationToken cancellationToken = default)
    {
        try
        {
            await EnsureContainerAsync(cancellationToken);
            var blob = _container.GetBlobClient(blobName);

            if (!await blob.ExistsAsync(cancellationToken))
            {
                return default;
            }

            var download = await blob.DownloadContentAsync(cancellationToken);
            return download.Value.Content.ToObjectFromJson<T>(_json);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Invalid JSON in blob {BlobName}", blobName);
            throw new InvalidOperationException($"Blob '{blobName}' contains invalid JSON.", ex);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogError(ex, "Unable to read blob {BlobName}", blobName);
            throw new InvalidOperationException($"Unable to read blob '{blobName}': {ex.Message}", ex);
        }
    }

    public async Task<T> GetOrCreateAsync<T>(
        string blobName,
        Func<T> defaultFactory,
        CancellationToken cancellationToken = default)
    {
        var existing = await GetAsync<T>(blobName, cancellationToken);
        if (existing is not null)
        {
            return existing;
        }

        var created = defaultFactory();
        await SaveAsync(blobName, created, cancellationToken);
        return created;
    }

    public async Task SaveAsync<T>(string blobName, T value, CancellationToken cancellationToken = default)
    {
        try
        {
            await EnsureContainerAsync(cancellationToken);
            var blob = _container.GetBlobClient(blobName);
            var payload = BinaryData.FromObjectAsJson(value, _json);
            await blob.UploadAsync(payload, new BlobUploadOptions
            {
                HttpHeaders = new BlobHttpHeaders { ContentType = "application/json" }
            }, cancellationToken);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogError(ex, "Unable to write blob {BlobName}", blobName);
            throw new InvalidOperationException($"Unable to write blob '{blobName}': {ex.Message}", ex);
        }
    }

    public async Task<bool> ExistsAsync(string blobName, CancellationToken cancellationToken = default)
    {
        await EnsureContainerAsync(cancellationToken);
        return await _container.GetBlobClient(blobName).ExistsAsync(cancellationToken);
    }

    public async Task DeleteAsync(string blobName, CancellationToken cancellationToken = default)
    {
        try
        {
            await EnsureContainerAsync(cancellationToken);
            await _container.GetBlobClient(blobName).DeleteIfExistsAsync(cancellationToken: cancellationToken);
        }
        catch (RequestFailedException ex)
        {
            _logger.LogError(ex, "Unable to delete blob {BlobName}", blobName);
            throw new InvalidOperationException($"Unable to delete blob '{blobName}': {ex.Message}", ex);
        }
    }

    private async Task EnsureContainerAsync(CancellationToken cancellationToken)
    {
        await _container.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
    }
}
