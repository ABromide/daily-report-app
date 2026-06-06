import Foundation

public enum ImportSource: Equatable, Sendable {
    case bundledFixture
    case data(Data)
    case localFile(URL)
    case remote(URL)
}

public enum ImportServiceError: Error, Equatable, LocalizedError, Sendable {
    case missingBundledFixture
    case failedToLoadRemote(URL)
    case failed(String)

    public var errorDescription: String? {
        switch self {
        case .missingBundledFixture:
            return "内置 public-data 样例缺失。/ Bundled public-data fixture is missing."
        case .failedToLoadRemote(let url):
            return "无法加载远端公开数据：\(url.absoluteString)。/ Failed to load remote public data."
        case .failed(let message):
            return message
        }
    }
}

public actor ImportService {
    private let store: SummaryCacheStore

    public init(store: SummaryCacheStore = SummaryCacheStore()) {
        self.store = store
    }

    @discardableResult
    public func importPayload(
        from source: ImportSource,
        status: SyncStatus = .cached
    ) async throws -> ImportResult {
        _ = try? await store.mark(status: .syncing)

        do {
            let data = try await loadData(from: source)
            let payload = try DailyReportJSON.decoder.decode(DailyReportPayload.self, from: data)
            let importedAt = Date()
            let summary = try await store.replace(
                with: payload,
                status: status,
                importedAt: importedAt
            )
            return ImportResult(
                summary: summary,
                importedReportCount: payload.reports.count
            )
        } catch {
            _ = try? await store.mark(
                status: .failed,
                errorMessage: error.localizedDescription
            )
            throw error
        }
    }

    public nonisolated func backgroundImportTask(
        from source: ImportSource,
        every interval: TimeInterval = 15 * 60
    ) -> Task<Void, Never> {
        Task {
            while !Task.isCancelled {
                _ = try? await importPayload(from: source)
                let nanoseconds = UInt64(max(interval, 1) * 1_000_000_000)
                try? await Task.sleep(nanoseconds: nanoseconds)
            }
        }
    }

    public static func bundledFixtureData() throws -> Data {
        let url = Bundle.module.url(
            forResource: "daily-report-sample",
            withExtension: "json"
        ) ?? Bundle.module.url(
            forResource: "daily-report-sample",
            withExtension: "json",
            subdirectory: "public-data"
        )

        guard let url else {
            throw ImportServiceError.missingBundledFixture
        }

        return try Data(contentsOf: url)
    }

    private func loadData(from source: ImportSource) async throws -> Data {
        switch source {
        case .bundledFixture:
            return try Self.bundledFixtureData()
        case .data(let data):
            return data
        case .localFile(let url):
            return try Data(contentsOf: url)
        case .remote(let url):
            do {
                let (data, response) = try await URLSession.shared.data(from: url)
                if let httpResponse = response as? HTTPURLResponse,
                   !(200..<300).contains(httpResponse.statusCode) {
                    throw ImportServiceError.failedToLoadRemote(url)
                }
                return data
            } catch let error as ImportServiceError {
                throw error
            } catch {
                throw ImportServiceError.failed(error.localizedDescription)
            }
        }
    }
}
