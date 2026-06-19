using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace FitnessDiary.Api.Services;

public sealed class LocalFileJsonRepository : IJsonRepository
{
    private readonly string _rootPath;
    private readonly JsonSerializerOptions _json;
    private readonly ILogger<LocalFileJsonRepository> _logger;

    public LocalFileJsonRepository(
        IConfiguration configuration,
        IHostEnvironment environment,
        JsonSerializerOptions json,
        ILogger<LocalFileJsonRepository> logger)
    {
        var configuredPath = ConfigurationReader.Get(configuration, "LocalJsonStoragePath")
            ?? ".local-data/fitness-diary";
        _rootPath = Path.GetFullPath(Path.IsPathRooted(configuredPath)
            ? configuredPath
            : Path.Combine(environment.ContentRootPath, configuredPath));
        _json = json;
        _logger = logger;

        Directory.CreateDirectory(_rootPath);
    }

    public async Task<T?> GetAsync<T>(string blobName, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(blobName);
        if (!File.Exists(path))
        {
            return default;
        }

        try
        {
            await using var stream = File.OpenRead(path);
            return await JsonSerializer.DeserializeAsync<T>(stream, _json, cancellationToken);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Invalid JSON in local file {Path}", path);
            throw new InvalidOperationException($"Local JSON file '{blobName}' contains invalid JSON.", ex);
        }
        catch (IOException ex)
        {
            _logger.LogError(ex, "Unable to read local JSON file {Path}", path);
            throw new InvalidOperationException($"Unable to read local JSON file '{blobName}': {ex.Message}", ex);
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
        var path = ResolvePath(blobName);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tempPath = $"{path}.{Guid.NewGuid():n}.tmp";

        try
        {
            await using (var stream = File.Create(tempPath))
            {
                await JsonSerializer.SerializeAsync(stream, value, _json, cancellationToken);
            }

            File.Move(tempPath, path, overwrite: true);
        }
        catch (IOException ex)
        {
            _logger.LogError(ex, "Unable to write local JSON file {Path}", path);
            throw new InvalidOperationException($"Unable to write local JSON file '{blobName}': {ex.Message}", ex);
        }
        finally
        {
            if (File.Exists(tempPath))
            {
                File.Delete(tempPath);
            }
        }
    }

    public Task<bool> ExistsAsync(string blobName, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(File.Exists(ResolvePath(blobName)));
    }

    public Task DeleteAsync(string blobName, CancellationToken cancellationToken = default)
    {
        var path = ResolvePath(blobName);
        if (File.Exists(path))
        {
            File.Delete(path);
        }

        return Task.CompletedTask;
    }

    private string ResolvePath(string blobName)
    {
        var relativePath = blobName
            .Replace('/', Path.DirectorySeparatorChar)
            .Replace('\\', Path.DirectorySeparatorChar);
        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, relativePath));
        var rootPath = _rootPath.EndsWith(Path.DirectorySeparatorChar)
            ? _rootPath
            : _rootPath + Path.DirectorySeparatorChar;

        if (!fullPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"Invalid local JSON file path '{blobName}'.");
        }

        return fullPath;
    }
}
