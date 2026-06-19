namespace FitnessDiary.Api.Services;

public static class BlobNames
{
    public const string Profile = "profile.json";
    public const string Settings = "settings.json";
    public const string Products = "products.json";

    public static string Nutrition(string date) => $"nutrition/{date}.json";
    public static string Workouts(string date) => $"workouts/{date}.json";
    public static string BodyMetrics(string date) => $"body-metrics/{date}.json";
}

