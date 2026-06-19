using System.Text.Json;
using FitnessDiary.Api.Auth;
using FitnessDiary.Api.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var host = new HostBuilder()
    .ConfigureHostConfiguration(configuration =>
    {
        configuration.AddEnvironmentVariables(prefix: "DOTNET_");
        configuration.AddEnvironmentVariables(prefix: "AZURE_FUNCTIONS_");
    })
    .ConfigureAppConfiguration((context, configuration) =>
    {
        configuration
            .AddJsonFile($"appsettings.{context.HostingEnvironment.EnvironmentName}.json", optional: true, reloadOnChange: false)
            .AddJsonFile("local.settings.json", optional: true, reloadOnChange: false)
            .AddEnvironmentVariables();
    })
    .ConfigureFunctionsWorkerDefaults(worker =>
    {
        worker.UseMiddleware<SimplePasswordMiddleware>();
    })
    .ConfigureServices((context, services) =>
    {
        services.AddSingleton(new JsonSerializerOptions(JsonSerializerDefaults.Web)
        {
            WriteIndented = true
        });

        var storageProvider = ConfigurationReader.Get(context.Configuration, "StorageProvider");
        if (string.IsNullOrWhiteSpace(storageProvider))
        {
            storageProvider = context.HostingEnvironment.IsDevelopment()
                ? "LocalFile"
                : "BlobStorage";
        }

        if (storageProvider.Equals("LocalFile", StringComparison.OrdinalIgnoreCase)
            || storageProvider.Equals("Local", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IJsonRepository, LocalFileJsonRepository>();
        }
        else if (storageProvider.Equals("BlobStorage", StringComparison.OrdinalIgnoreCase)
            || storageProvider.Equals("Blob", StringComparison.OrdinalIgnoreCase))
        {
            services.AddSingleton<IJsonRepository, BlobStorageJsonRepository>();
        }
        else
        {
            throw new InvalidOperationException($"Unsupported StorageProvider '{storageProvider}'. Use 'LocalFile' or 'BlobStorage'.");
        }

        services.AddSingleton(_ => new HttpClient
        {
            BaseAddress = new Uri("https://world.openfoodfacts.org/")
        });
        services.AddSingleton<OpenFoodFactsClient>();
    })
    .Build();

host.Run();
