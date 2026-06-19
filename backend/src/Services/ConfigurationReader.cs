using Microsoft.Extensions.Configuration;

namespace FitnessDiary.Api.Services;

public static class ConfigurationReader
{
    public static string? Get(IConfiguration configuration, string key) =>
        configuration[key] ?? configuration[$"Values:{key}"];
}

