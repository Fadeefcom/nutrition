using System.Net;
using System.Text.Json;
using FitnessDiary.Api.Extensions;
using FitnessDiary.Api.Models;
using FitnessDiary.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

namespace FitnessDiary.Api.Functions;

public sealed class DiaryFunctions(IJsonRepository repository, JsonSerializerOptions json)
{
    [Function("GetNutrition")]
    public async Task<HttpResponseData> GetNutrition(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "nutrition/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var day = await repository.GetOrCreateAsync(BlobNames.Nutrition(date), () => Defaults.DailyNutrition(date), cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, DiaryCalculations.Normalize(day), json, cancellationToken);
    }

    [Function("PutNutrition")]
    public async Task<HttpResponseData> PutNutrition(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "nutrition/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var day = await request.ReadJsonAsync<DailyNutrition>(json, cancellationToken);
        if (day is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Daily nutrition body is required.", json, cancellationToken);
        }

        var saved = DiaryCalculations.Normalize(day with { Date = date });
        await repository.SaveAsync(BlobNames.Nutrition(date), saved, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, saved, json, cancellationToken);
    }

    [Function("GetWorkout")]
    public async Task<HttpResponseData> GetWorkout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "workouts/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var day = await repository.GetOrCreateAsync(BlobNames.Workouts(date), () => Defaults.DailyWorkout(date), cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, DiaryCalculations.Normalize(day), json, cancellationToken);
    }

    [Function("PutWorkout")]
    public async Task<HttpResponseData> PutWorkout(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "workouts/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var day = await request.ReadJsonAsync<DailyWorkout>(json, cancellationToken);
        if (day is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Daily workout body is required.", json, cancellationToken);
        }

        var saved = DiaryCalculations.Normalize(day with { Date = date });
        await repository.SaveAsync(BlobNames.Workouts(date), saved, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, saved, json, cancellationToken);
    }

    [Function("GetBodyMetric")]
    public async Task<HttpResponseData> GetBodyMetric(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "body-metrics/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var metric = await repository.GetOrCreateAsync(BlobNames.BodyMetrics(date), () => Defaults.BodyMetric(date), cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, metric, json, cancellationToken);
    }

    [Function("PutBodyMetric")]
    public async Task<HttpResponseData> PutBodyMetric(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "body-metrics/{date}")] HttpRequestData request,
        string date,
        CancellationToken cancellationToken)
    {
        var metric = await request.ReadJsonAsync<BodyMetric>(json, cancellationToken);
        if (metric is null)
        {
            return await request.ErrorAsync(HttpStatusCode.BadRequest, "Body metric body is required.", json, cancellationToken);
        }

        var saved = metric with { Date = date };
        await repository.SaveAsync(BlobNames.BodyMetrics(date), saved, cancellationToken);
        return await request.JsonAsync(HttpStatusCode.OK, saved, json, cancellationToken);
    }
}

