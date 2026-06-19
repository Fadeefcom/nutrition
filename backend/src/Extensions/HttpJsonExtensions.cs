using System.Net;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Extensions;

public static class HttpJsonExtensions
{
    public static async Task<T?> ReadJsonAsync<T>(
        this HttpRequestData request,
        JsonSerializerOptions json,
        CancellationToken cancellationToken = default)
    {
        using var reader = new StreamReader(request.Body);
        var body = await reader.ReadToEndAsync(cancellationToken);
        return string.IsNullOrWhiteSpace(body)
            ? default
            : JsonSerializer.Deserialize<T>(body, json);
    }

    public static async Task<HttpResponseData> JsonAsync<T>(
        this HttpRequestData request,
        HttpStatusCode statusCode,
        T value,
        JsonSerializerOptions json,
        CancellationToken cancellationToken = default)
    {
        var response = request.CreateResponse(statusCode);
        response.Headers.Add("Content-Type", "application/json");
        response.Headers.Add("Access-Control-Allow-Origin", "*");
        response.Headers.Add("Access-Control-Allow-Headers", "content-type,x-diary-password");
        await response.WriteStringAsync(JsonSerializer.Serialize(value, json), cancellationToken);
        return response;
    }

    public static async Task<HttpResponseData> ErrorAsync(
        this HttpRequestData request,
        HttpStatusCode statusCode,
        string message,
        JsonSerializerOptions json,
        CancellationToken cancellationToken = default)
    {
        return await request.JsonAsync(statusCode, new { error = message }, json, cancellationToken);
    }

    public static HttpResponseData NoContent(this HttpRequestData request)
    {
        var response = request.CreateResponse(HttpStatusCode.NoContent);
        response.Headers.Add("Access-Control-Allow-Origin", "*");
        response.Headers.Add("Access-Control-Allow-Headers", "content-type,x-diary-password");
        return response;
    }
}

