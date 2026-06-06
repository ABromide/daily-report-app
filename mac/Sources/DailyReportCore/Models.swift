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

public enum DataMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case fixture
    case remote
    case bundled
    case mock

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .fixture:
            return "公开数据 / Public data"
        case .remote:
            return "远端同步 / Remote sync"
        case .bundled:
            return "内置样例 / Bundled sample"
        case .mock:
            return "模拟数据 / Mock"
        }
    }
}

public enum ContentClusterID: String, Codable, CaseIterable, Identifiable, Sendable {
    case llmAgent = "llm-agent"
    case llmPostTraining = "llm-post-training"
    case aiSafety = "ai-safety"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .llmAgent:
            return "大模型 Agent 相关"
        case .llmPostTraining:
            return "大模型后训练相关"
        case .aiSafety:
            return "AI 安全相关"
        }
    }

    public var thesis: String {
        switch self {
        case .llmAgent:
            return "关注大模型从回答问题走向调用工具、执行任务、进入真实开发流的能力变化。"
        case .llmPostTraining:
            return "覆盖 SFT、强化学习、OPD、适配器和蒸馏等前沿工作。"
        case .aiSafety:
            return "关注前沿模型治理、攻防风险、能力阈值、权限边界和安全部署。"
        }
    }

    public var summary: String {
        switch self {
        case .llmAgent:
            return "这一组聚焦 Agent 平台、长期任务、代码工作流和本地 AI 界面。"
        case .llmPostTraining:
            return "这一组把后训练当作独立频道，而不是泛泛的模型研究。"
        case .aiSafety:
            return "这一组看 AI 进入真实系统后如何改变攻击面、研发流程和治理结构。"
        }
    }

    public var tags: [String] {
        switch self {
        case .llmAgent:
            return ["Agent 平台", "工具调用", "代码工作流"]
        case .llmPostTraining:
            return ["SFT", "强化学习", "OPD"]
        case .aiSafety:
            return ["Frontier Safety", "网络攻防", "权限边界"]
        }
    }

    public var systemImageName: String {
        switch self {
        case .llmAgent:
            return "command"
        case .llmPostTraining:
            return "slider.horizontal.3"
        case .aiSafety:
            return "shield.lefthalf.filled"
        }
    }
}

public enum ContentType: String, Codable, CaseIterable, Identifiable, Sendable {
    case paper
    case blog
    case code
    case report

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .paper:
            return "论文"
        case .blog:
            return "博客"
        case .code:
            return "代码"
        case .report:
            return "AI 报告"
        }
    }

    public var systemImageName: String {
        switch self {
        case .paper:
            return "doc.text"
        case .blog:
            return "text.quote"
        case .code:
            return "chevron.left.forwardslash.chevron.right"
        case .report:
            return "doc.richtext"
        }
    }
}

public struct ShowcaseStat: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var label: String
    public var value: String

    public init(id: String, label: String, value: String) {
        self.id = id
        self.label = label
        self.value = value
    }
}

public struct ShowcaseCluster: Codable, Equatable, Identifiable, Sendable {
    public var id: ContentClusterID
    public var title: String
    public var thesis: String
    public var summary: String
    public var tags: [String]
    public var documentCount: Int
    public var lastUpdatedAt: Date

    public init(
        id: ContentClusterID,
        title: String,
        thesis: String,
        summary: String,
        tags: [String],
        documentCount: Int,
        lastUpdatedAt: Date
    ) {
        self.id = id
        self.title = title
        self.thesis = thesis
        self.summary = summary
        self.tags = tags
        self.documentCount = documentCount
        self.lastUpdatedAt = lastUpdatedAt
    }
}

public struct ShowcaseSource: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var kind: String
    public var homepageURL: URL?
    public var note: String
    public var enabled: Bool
    public var itemCount: Int

    public init(
        id: String,
        name: String,
        kind: String,
        homepageURL: URL? = nil,
        note: String,
        enabled: Bool,
        itemCount: Int
    ) {
        self.id = id
        self.name = name
        self.kind = kind
        self.homepageURL = homepageURL
        self.note = note
        self.enabled = enabled
        self.itemCount = itemCount
    }
}

public struct ShowcaseDocument: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var clusterID: ContentClusterID
    public var type: ContentType
    public var typeLabel: String
    public var title: String
    public var summary: String
    public var analysis: String
    public var sourceName: String
    public var url: URL
    public var publishedAt: Date
    public var readingMinutes: Int
    public var score: Int
    public var tags: [String]
    public var domain: String
    public var analysisMarkdownPath: String
    public var analysisMarkdown: String?
    public var searchText: String
    public var evidence: [EvidenceSource]

    public init(
        id: String,
        clusterID: ContentClusterID,
        type: ContentType,
        typeLabel: String,
        title: String,
        summary: String,
        analysis: String,
        sourceName: String,
        url: URL,
        publishedAt: Date,
        readingMinutes: Int,
        score: Int,
        tags: [String],
        domain: String,
        analysisMarkdownPath: String,
        analysisMarkdown: String?,
        searchText: String,
        evidence: [EvidenceSource]
    ) {
        self.id = id
        self.clusterID = clusterID
        self.type = type
        self.typeLabel = typeLabel
        self.title = title
        self.summary = summary
        self.analysis = analysis
        self.sourceName = sourceName
        self.url = url
        self.publishedAt = publishedAt
        self.readingMinutes = readingMinutes
        self.score = score
        self.tags = tags
        self.domain = domain
        self.analysisMarkdownPath = analysisMarkdownPath
        self.analysisMarkdown = analysisMarkdown
        self.searchText = searchText
        self.evidence = evidence
    }
}

public struct DailyReportPayload: Codable, Equatable, Sendable {
    public var manifest: PublicDataManifest
    public var generatedAt: Date
    public var dataMode: DataMode
    public var dataPath: String
    public var repoURL: URL?
    public var stats: [ShowcaseStat]
    public var clusters: [ShowcaseCluster]
    public var documents: [ShowcaseDocument]
    public var sources: [ShowcaseSource]

    public init(
        manifest: PublicDataManifest,
        generatedAt: Date,
        dataMode: DataMode,
        dataPath: String,
        repoURL: URL? = nil,
        stats: [ShowcaseStat],
        clusters: [ShowcaseCluster],
        documents: [ShowcaseDocument],
        sources: [ShowcaseSource]
    ) {
        self.manifest = manifest
        self.generatedAt = generatedAt
        self.dataMode = dataMode
        self.dataPath = dataPath
        self.repoURL = repoURL
        self.stats = stats
        self.clusters = clusters
        self.documents = documents
        self.sources = sources
    }
}

public struct PublicDataManifest: Codable, Equatable, Sendable {
    public var version: Int
    public var generatedAt: Date
    public var latestDay: String?
    public var manifestPath: String?
    public var manifestSHA256: String?
    public var root: String?
    public var totalFiles: Int
    public var totalBytes: Int
    public var dataBranchRef: String
    public var publicBaseURL: URL?

    public init(
        version: Int,
        generatedAt: Date,
        latestDay: String? = nil,
        manifestPath: String? = nil,
        manifestSHA256: String? = nil,
        root: String? = nil,
        totalFiles: Int = 0,
        totalBytes: Int = 0,
        dataBranchRef: String = "public-data",
        publicBaseURL: URL? = nil
    ) {
        self.version = version
        self.generatedAt = generatedAt
        self.latestDay = latestDay
        self.manifestPath = manifestPath
        self.manifestSHA256 = manifestSHA256
        self.root = root
        self.totalFiles = totalFiles
        self.totalBytes = totalBytes
        self.dataBranchRef = dataBranchRef
        self.publicBaseURL = publicBaseURL
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
    public let summary: CachedSummary
    public let importedDocumentCount: Int

    public init(summary: CachedSummary, importedDocumentCount: Int) {
        self.summary = summary
        self.importedDocumentCount = importedDocumentCount
    }
}

public enum DailyReportDateParser {
    private static let internetFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    public static func parse(_ value: String) -> Date? {
        internetFormatter.date(from: value)
            ?? standardFormatter.date(from: value)
            ?? dayFormatter.date(from: value)
    }
}

public enum DailyReportJSON {
    public static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = DailyReportDateParser.parse(value) {
                return date
            }

            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Expected ISO-8601 date string, got \(value)."
            )
        }
        return decoder
    }

    public static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
