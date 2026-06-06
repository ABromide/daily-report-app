import Foundation

public enum SyncStatus: String, Codable, CaseIterable, Identifiable, Sendable {
    case cached
    case stale
    case syncing
    case failed
    case localOnly

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .cached:
            return "已缓存 / Cached"
        case .stale:
            return "已过期 / Stale"
        case .syncing:
            return "同步中 / Syncing"
        case .failed:
            return "同步失败 / Failed"
        case .localOnly:
            return "仅本地 / Local only"
        }
    }

    public var systemImageName: String {
        switch self {
        case .cached:
            return "checkmark.icloud"
        case .stale:
            return "clock.badge.exclamationmark"
        case .syncing:
            return "arrow.triangle.2.circlepath"
        case .failed:
            return "exclamationmark.triangle"
        case .localOnly:
            return "externaldrive"
        }
    }
}

public enum ReportImportance: String, Codable, CaseIterable, Identifiable, Sendable {
    case low
    case medium
    case high
    case critical

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .low:
            return "低 / Low"
        case .medium:
            return "中 / Medium"
        case .high:
            return "高 / High"
        case .critical:
            return "关键 / Critical"
        }
    }
}

public enum SourceRunStatus: String, Codable, CaseIterable, Identifiable, Sendable {
    case healthy
    case degraded
    case failed
    case unknown

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .healthy:
            return "健康 / Healthy"
        case .degraded:
            return "降级 / Degraded"
        case .failed:
            return "失败 / Failed"
        case .unknown:
            return "未知 / Unknown"
        }
    }
}

public struct DailyReportPayload: Codable, Equatable, Sendable {
    public var manifest: PublicDataManifest
    public var reports: [ReportItem]
    public var sourceHealth: [SourceHealth]

    public init(
        manifest: PublicDataManifest,
        reports: [ReportItem],
        sourceHealth: [SourceHealth]
    ) {
        self.manifest = manifest
        self.reports = reports
        self.sourceHealth = sourceHealth
    }
}

public struct PublicDataManifest: Codable, Equatable, Sendable {
    public var schemaVersion: String
    public var generatedAt: Date
    public var runID: String
    public var dataBranchRef: String
    public var publicBaseURL: URL?

    public init(
        schemaVersion: String,
        generatedAt: Date,
        runID: String,
        dataBranchRef: String,
        publicBaseURL: URL? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.generatedAt = generatedAt
        self.runID = runID
        self.dataBranchRef = dataBranchRef
        self.publicBaseURL = publicBaseURL
    }
}

public struct ReportItem: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var summary: String
    public var bodyMarkdown: String
    public var publishedAt: Date
    public var updatedAt: Date?
    public var tags: [String]
    public var readingTimeMinutes: Int
    public var importance: ReportImportance
    public var sources: [EvidenceSource]

    public init(
        id: String,
        title: String,
        summary: String,
        bodyMarkdown: String,
        publishedAt: Date,
        updatedAt: Date? = nil,
        tags: [String],
        readingTimeMinutes: Int,
        importance: ReportImportance,
        sources: [EvidenceSource]
    ) {
        self.id = id
        self.title = title
        self.summary = summary
        self.bodyMarkdown = bodyMarkdown
        self.publishedAt = publishedAt
        self.updatedAt = updatedAt
        self.tags = tags
        self.readingTimeMinutes = readingTimeMinutes
        self.importance = importance
        self.sources = sources
    }
}

public struct EvidenceSource: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var title: String
    public var url: URL
    public var host: String
    public var capturedAt: Date?
    public var checksumSHA256: String?

    public init(
        id: String,
        title: String,
        url: URL,
        host: String,
        capturedAt: Date? = nil,
        checksumSHA256: String? = nil
    ) {
        self.id = id
        self.title = title
        self.url = url
        self.host = host
        self.capturedAt = capturedAt
        self.checksumSHA256 = checksumSHA256
    }
}

public struct SourceHealth: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var status: SourceRunStatus
    public var lastSeenAt: Date?
    public var itemCount: Int
    public var note: String?

    public init(
        id: String,
        name: String,
        status: SourceRunStatus,
        lastSeenAt: Date? = nil,
        itemCount: Int,
        note: String? = nil
    ) {
        self.id = id
        self.name = name
        self.status = status
        self.lastSeenAt = lastSeenAt
        self.itemCount = itemCount
        self.note = note
    }
}

public struct CachedSummary: Codable, Equatable, Sendable {
    public var status: SyncStatus
    public var payload: DailyReportPayload
    public var importedAt: Date
    public var staleAfter: Date
    public var errorMessage: String?

    public init(
        status: SyncStatus,
        payload: DailyReportPayload,
        importedAt: Date,
        staleAfter: Date,
        errorMessage: String? = nil
    ) {
        self.status = status
        self.payload = payload
        self.importedAt = importedAt
        self.staleAfter = staleAfter
        self.errorMessage = errorMessage
    }

    public var effectiveStatus: SyncStatus {
        if status == .cached, staleAfter <= Date() {
            return .stale
        }

        return status
    }
}

public struct ImportResult: Equatable, Sendable {
    public var summary: CachedSummary
    public var importedReportCount: Int

    public init(summary: CachedSummary, importedReportCount: Int) {
        self.summary = summary
        self.importedReportCount = importedReportCount
    }
}

public enum DailyReportJSON {
    public static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
