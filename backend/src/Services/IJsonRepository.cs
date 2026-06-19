namespace FitnessDiary.Api.Services;

public interface IJsonRepository
{
    Task<T?> GetAsync<T>(string blobName, CancellationToken cancellationToken = default);
    Task<T> GetOrCreateAsync<T>(string blobName, Func<T> defaultFactory, CancellationToken cancellationToken = default);
    Task SaveAsync<T>(string blobName, T value, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(string blobName, CancellationToken cancellationToken = default);
    Task DeleteAsync(string blobName, CancellationToken cancellationToken = default);
}

