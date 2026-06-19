using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class SettingsFunctions(IJsonRepository repository, JsonSerializerOptions json)
{
    [Function("GetSettings")]
    public async Task<HttpResponseData> GetSettings(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "settings")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, settings, json, cancellationToken);
    }

    [Function("PutSettings")]
    public async Task<HttpResponseData> PutSettings(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "settings")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var settings = await request.ReadJsonAsync<Settings>(json, cancellationToken);
        if (settings is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Settings body is required.", json, cancellationToken);
        }

        var total = settings.NutritionTarget.ProteinPercent
            + settings.NutritionTarget.CarbsPercent
            + settings.NutritionTarget.FatPercent;

        if (total != 100)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Macro percentages must total 100.", json, cancellationToken);
        }

        await repository.SaveAsync(BlobNames.Settings, settings, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, settings, json, cancellationToken);
    }

    [Function("GetExerciseTargets")]
    public async Task<HttpResponseData> GetExerciseTargets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "exercise-targets")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, settings.ExerciseTargets, json, cancellationToken);
    }

    [Function("PostExerciseTarget")]
    public async Task<HttpResponseData> PostExerciseTarget(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "exercise-targets")] HttpRequestData request,
        CancellationToken cancellationToken)
    {
        var target = await request.ReadJsonAsync<ExerciseTarget>(json, cancellationToken);
        if (target is null || string.IsNullOrWhiteSpace(target.ExerciseName))
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Exercise target body is required.", json, cancellationToken);
        }

        var settings = await GetSettingsAsync(cancellationToken);
        var saved = target with
        {
            Id = string.IsNullOrWhiteSpace(target.Id) ? Guid.NewGuid().ToString("n") : target.Id,
            TargetTotalReps = target.TargetTotalReps > 0
                ? target.TargetTotalReps
                : (int)(target.TargetSets * target.TargetRepsPerSet)
        };
        settings.ExerciseTargets.Add(saved);
        await repository.SaveAsync(BlobNames.Settings, settings, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.Created, saved, json, cancellationToken);
    }

    [Function("PutExerciseTarget")]
    public async Task<HttpResponseData> PutExerciseTarget(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "exercise-targets/{id}")] HttpRequestData request,
        string id,
        CancellationToken cancellationToken)
    {
        var target = await request.ReadJsonAsync<ExerciseTarget>(json, cancellationToken);
        if (target is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Exercise target body is required.", json, cancellationToken);
        }

        var settings = await GetSettingsAsync(cancellationToken);
        var index = settings.ExerciseTargets.FindIndex(x => x.Id == id);
        if (index < 0)
        {
            return await request.ErrorAsync(HttpStatusCode.NotFound, "Exercise target was not found.", json, cancellationToken);
        }

        var saved = target with
        {
            Id = id,
            TargetTotalReps = target.TargetTotalReps > 0
                ? target.TargetTotalReps
                : (int)(target.TargetSets * target.TargetRepsPerSet)
        };
        settings.ExerciseTargets[index] = saved;
        await repository.SaveAsync(BlobNames.Settings, settings, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, saved, json, cancellationToken);
    }

    [Function("DeleteExerciseTarget")]
    public async Task<HttpResponseData> DeleteExerciseTarget(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "exercise-targets/{id}")] HttpRequestData request,
        string id,
        CancellationToken cancellationToken)
    {
        var settings = await GetSettingsAsync(cancellationToken);
        settings.ExerciseTargets.RemoveAll(x => x.Id == id);
        await repository.SaveAsync(BlobNames.Settings, settings, cancellationToken);
        return request.NoContent();
    }

    private Task<Settings> GetSettingsAsync(CancellationToken cancellationToken) =>
        repository.GetOrCreateAsync(BlobNames.Settings, Defaults.Settings, cancellationToken);
}

