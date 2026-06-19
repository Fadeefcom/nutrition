using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class ProfileFunctions(IJsonRepository repository, JsonSerializerOptions json)
{
    [Function("GetProfile")]
    public async Task<HttpResponseData> GetProfile(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "profile")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var profile = await repository.GetOrCreateAsync(BlobNames.Profile, Defaults.Profile, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, profile, json, cancellationToken);
    }

    [Function("PutProfile")]
    public async Task<HttpResponseData> PutProfile(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "profile")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var profile = await request.ReadJsonAsync<Profile>(json, cancellationToken);
        if (profile is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Profile body is required.", json, cancellationToken);
        }

        await repository.SaveAsync(BlobNames.Profile, profile, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, profile, json, cancellationToken);
    }
}

