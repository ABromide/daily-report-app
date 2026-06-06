import Foundation

public enum PublicDataLoaderError: Error, LocalizedError, Sendable {
    case missingLatest(URL)
    case missingManifestPath(URL)
    case unsafePublicPath(String)
    case invalidJSON(URL)
    case invalidJSONL(URL, line: Int)
    case missingBundledFixture
    case failedToLoadRemote(URL)

    public var errorDescription: String? {
        switch self {
        case .missingLatest(let url):
            return "缺少 latest.json：\(url.path)。/ Missing latest.json."
        case .missingManifestPath(let url):
            return "latest.json 没有 manifest_path：\(url.path)。/ latest.json does not contain manifest_path."
        case .unsafePublicPath(let path):
            return "不安全的 public-data 路径：\(path)。/ Unsafe public-data path."
        case .invalidJSON(let url):
            return "无法解析 JSON：\(url.path)。/ Failed to parse JSON."
        case .invalidJSONL(let url, let line):
            return "无法解析 JSONL：\(url.path) 第 \(line) 行。/ Failed to parse JSONL line \(line)."
        case .missingBundledFixture:
            return "内置 public-data 样例缺失。/ Bundled public-data fixture is missing."
        case .failedToLoadRemote(let url):
            return "无法加载远端公开数据：\(url.absoluteString)。/ Failed to load remote public data."
        }
    }
}

public struct PublicDataLoader: Sendable {
    public static let repositoryURL = URL(string: "https://github.com/ABromide/daily-report-app")

    public init() {}

    public func load(
        fromDirectory directory: URL,
        dataPathLabel: String? = nil
    ) throws -> DailyReportPayload {
        let latestURL = directory
            .appendingPathComponent("index", isDirectory: true)
            .appendingPathComponent("latest.json")

        guard FileManager.default.fileExists(atPath: latestURL.path) else {
            throw PublicDataLoaderError.missingLatest(latestURL)
        }

        let latest = try readJSON(latestURL)
        guard let manifestPath = string(latest["manifest_path"]) else {
            throw PublicDataLoaderError.missingManifestPath(latestURL)
        }

        let manifestURL = try localURL(root: directory, relativePath: manifestPath)
        let manifest = try readJSON(manifestURL)
        let files = records(manifest["files"])
        let itemsPath = findManifestPath(files) { path in
            path.hasPrefix("items/") && path.hasSuffix(".jsonl")
        }
        let sourcesPath = findManifestPath(files) { path in
            path == "index/sources.json"
        } ?? "index/sources.json"

        let items: [JSONRecord]
        if let itemsPath {
            items = try readJSONL(localURL(root: directory, relativePath: itemsPath))
        } else {
            items = []
        }

        let sourcesIndex: JSONRecord
        let sourcesURL = try localURL(root: directory, relativePath: sourcesPath)
        if FileManager.default.fileExists(atPath: sourcesURL.path) {
            sourcesIndex = (try? readJSON(sourcesURL)) ?? [:]
        } else {
            sourcesIndex = [:]
        }

        return normalize(
            latest: latest,
            manifest: manifest,
            manifestPath: manifestPath,
            dataMode: .fixture,
            dataPath: dataPathLabel ?? directory.path,
            publicBaseURL: nil,
            items: items,
            sourcesIndex: sourcesIndex
        ) { relativePath in
            guard let url = try? localURL(root: directory, relativePath: relativePath) else {
                return nil
            }
            return try? String(contentsOf: url, encoding: .utf8)
        }
    }

    public func load(
        fromBaseURL baseURL: URL,
        dataPathLabel: String? = nil
    ) async throws -> DailyReportPayload {
        let latestURL = try remoteURL(baseURL: baseURL, relativePath: "index/latest.json")
        let latest = try await readRemoteJSON(latestURL)
        guard let manifestPath = string(latest["manifest_path"]) else {
            throw PublicDataLoaderError.missingManifestPath(latestURL)
        }

        let manifest = try await readRemoteJSON(remoteURL(baseURL: baseURL, relativePath: manifestPath))
        let files = records(manifest["files"])
        let itemsPath = findManifestPath(files) { path in
            path.hasPrefix("items/") && path.hasSuffix(".jsonl")
        }
        let sourcesPath = findManifestPath(files) { path in
            path == "index/sources.json"
        } ?? "index/sources.json"

        let items: [JSONRecord]
        if let itemsPath {
            items = try await readRemoteJSONL(remoteURL(baseURL: baseURL, relativePath: itemsPath))
        } else {
            items = []
        }

        let sourcesIndex = (try? await readRemoteJSON(remoteURL(baseURL: baseURL, relativePath: sourcesPath))) ?? [:]
        let generatedAt = dateValue(manifest["generated_at"]) ?? dateValue(latest["generated_at"]) ?? Date()
        let analysisPaths = Set(items.enumerated().map { index, item in
            analysisMarkdownPath(item: item, index: index, generatedAt: generatedAt)
        })
        var analysisByPath: [String: String] = [:]
        for path in analysisPaths {
            let url = try remoteURL(baseURL: baseURL, relativePath: path)
            analysisByPath[path] = try? await readRemoteText(url)
        }

        return normalize(
            latest: latest,
            manifest: manifest,
            manifestPath: manifestPath,
            dataMode: .remote,
            dataPath: dataPathLabel ?? baseURL.absoluteString,
            publicBaseURL: baseURL,
            items: items,
            sourcesIndex: sourcesIndex
        ) { relativePath in
            analysisByPath[relativePath]
        }
    }

    public static func discoverLocalPublicDataDirectory() -> URL? {
        let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        let candidates = [
            cwd.appendingPathComponent("fixtures/public-data/public", isDirectory: true),
            cwd.appendingPathComponent("../fixtures/public-data/public", isDirectory: true),
            cwd.appendingPathComponent("../../fixtures/public-data/public", isDirectory: true)
        ]

        return candidates.first { candidate in
            FileManager.default.fileExists(
                atPath: candidate
                    .appendingPathComponent("index", isDirectory: true)
                    .appendingPathComponent("latest.json")
                    .standardizedFileURL
                    .path
            )
        }?.standardizedFileURL
    }

    private typealias JSONRecord = [String: Any]

    private func normalize(
        latest: JSONRecord,
        manifest: JSONRecord,
        manifestPath: String,
        dataMode: DataMode,
        dataPath: String,
        publicBaseURL: URL?,
        items: [JSONRecord],
        sourcesIndex: JSONRecord,
        readText: (String) -> String?
    ) -> DailyReportPayload {
        let generatedAt = dateValue(manifest["generated_at"]) ?? dateValue(latest["generated_at"]) ?? Date()
        let sources = records(sourcesIndex["sources"])
        let sourcesByID = sourcesByID(sources)
        let itemCounts = itemCountsBySource(items)
        let documents = items.enumerated()
            .map { index, item in
                normalizeItem(
                    item,
                    index: index,
                    generatedAt: generatedAt,
                    sourcesByID: sourcesByID,
                    readText: readText
                )
            }
            .sorted { lhs, rhs in
                lhs.publishedAt > rhs.publishedAt
            }

        let sourceModels = normalizeSources(sources, itemCounts: itemCounts)
        let clusters = ContentClusterID.allCases.map { clusterID in
            let clusterDocuments = documents.filter { $0.clusterID == clusterID }
            return ShowcaseCluster(
                id: clusterID,
                title: clusterID.title,
                thesis: clusterID.thesis,
                summary: clusterID.summary,
                tags: clusterID.tags,
                documentCount: clusterDocuments.count,
                lastUpdatedAt: clusterDocuments.first?.publishedAt ?? generatedAt
            )
        }

        let manifestModel = PublicDataManifest(
            version: int(manifest["version"], fallback: int(latest["version"], fallback: 1)),
            generatedAt: generatedAt,
            latestDay: string(latest["latest_day"]),
            manifestPath: manifestPath,
            manifestSHA256: string(latest["manifest_sha256"]),
            root: string(manifest["root"]),
            totalFiles: int(manifest["total_files"], fallback: 0),
            totalBytes: int(manifest["total_bytes"], fallback: 0),
            dataBranchRef: string(manifest["root"]) ?? "public-data",
            publicBaseURL: publicBaseURL
        )

        return DailyReportPayload(
            manifest: manifestModel,
            generatedAt: generatedAt,
            dataMode: dataMode,
            dataPath: dataPath,
            repoURL: Self.repositoryURL,
            stats: buildStats(documents: documents),
            clusters: clusters,
            documents: documents,
            sources: sourceModels
        )
    }

    private func normalizeItem(
        _ item: JSONRecord,
        index: Int,
        generatedAt: Date,
        sourcesByID: [String: JSONRecord],
        readText: (String) -> String?
    ) -> ShowcaseDocument {
        let id = string(item["item_id"]) ?? string(item["id"]) ?? "item-\(index + 1)"
        let clusterID = ContentClusterID(rawValue: string(item["category_id"]) ?? "") ?? .llmAgent
        let type = ContentType(rawValue: string(item["type"]) ?? "") ?? .blog
        let sourceID = string(item["source_id"]) ?? ""
        let source = sourcesByID[sourceID]
        let title = string(item["title"]) ?? "Untitled research signal"
        let summary = string(item["summary_zh"]) ?? string(item["summary"]) ?? "这篇内容还没有摘要。"
        let sourceName = string(item["source_name"]) ?? string(source?["name"]) ?? sourceID.ifEmpty("Unknown source")
        let url = urlValue(item["url"]) ?? urlValue(item["canonical_url"]) ?? Self.repositoryURL!
        let domain = hostname(url)
        let tags = stringArray(item["tags"])
        let publishedAt = dateValue(item["sort_at"])
            ?? dateValue(item["published_at"])
            ?? dateValue(item["fetched_at"])
            ?? generatedAt
        let readingMinutes = int(
            item["reading_minutes"],
            fallback: max(4, Int(ceil(Double(summary.count) / 140.0)))
        )
        let score = int(item["score"], fallback: int(item["importance_score"], fallback: 80))
        let analysisPath = string(item["analysis_markdown_path"])
            ?? articleMarkdownPath(publishedAt: publishedAt, id: id)
        let analysisMarkdown = readText(analysisPath)
        let analysis = string(item["analysis"]) ?? string(item["analysis_zh"]) ?? ""
        let searchText = [
            title,
            summary,
            analysis,
            sourceName,
            domain,
            clusterID.title,
            type.rawValue,
            tags.joined(separator: " ")
        ]
            .joined(separator: " ")
            .lowercased()

        return ShowcaseDocument(
            id: id,
            clusterID: clusterID,
            type: type,
            typeLabel: type.displayName,
            title: title,
            summary: summary,
            analysis: analysis,
            sourceName: sourceName,
            url: url,
            publishedAt: publishedAt,
            readingMinutes: readingMinutes,
            score: score,
            tags: tags,
            domain: domain,
            analysisMarkdownPath: analysisPath,
            analysisMarkdown: analysisMarkdown,
            searchText: searchText,
            evidence: normalizeEvidence(item: item, fallbackURL: url, fallbackTitle: sourceName)
        )
    }

    private func normalizeSources(
        _ sources: [JSONRecord],
        itemCounts: [String: Int]
    ) -> [ShowcaseSource] {
        var sourceModels = sources.enumerated().map { index, source in
            let id = string(source["id"]) ?? string(source["source_id"]) ?? "source-\(index + 1)"
            return ShowcaseSource(
                id: id,
                name: string(source["name"]) ?? id,
                kind: string(source["kind"]) ?? string(source["type"]) ?? "manual",
                homepageURL: urlValue(source["homepage_url"]) ?? urlValue(source["url"]),
                note: string(source["description"]) ?? string(source["notes"]) ?? "Public source",
                enabled: bool(source["enabled"], fallback: true),
                itemCount: itemCounts[id] ?? 0
            )
        }

        if sourceModels.isEmpty {
            sourceModels = itemCounts.keys.sorted().map { sourceID in
                ShowcaseSource(
                    id: sourceID,
                    name: sourceID,
                    kind: "public",
                    note: "Derived from public items.",
                    enabled: true,
                    itemCount: itemCounts[sourceID] ?? 0
                )
            }
        }

        return sourceModels
    }

    private func normalizeEvidence(
        item: JSONRecord,
        fallbackURL: URL,
        fallbackTitle: String
    ) -> [EvidenceSource] {
        let evidence = records(item["evidence"]).enumerated().compactMap { index, entry -> EvidenceSource? in
            guard let url = urlValue(entry["url"]) else {
                return nil
            }

            return EvidenceSource(
                id: "\(string(item["item_id"]) ?? "item")-evidence-\(index + 1)",
                title: string(entry["label"]) ?? string(entry["title"]) ?? hostname(url),
                url: url,
                host: hostname(url),
                capturedAt: dateValue(item["fetched_at"]),
                checksumSHA256: string(item["content_hash"]) ?? string(item["fingerprint"])
            )
        }

        if !evidence.isEmpty {
            return evidence
        }

        return [
            EvidenceSource(
                id: "\(string(item["item_id"]) ?? "item")-source",
                title: fallbackTitle,
                url: fallbackURL,
                host: hostname(fallbackURL),
                capturedAt: dateValue(item["fetched_at"]),
                checksumSHA256: string(item["content_hash"]) ?? string(item["fingerprint"])
            )
        ]
    }

    private func buildStats(documents: [ShowcaseDocument]) -> [ShowcaseStat] {
        var seenTags = Set<String>()
        var topicTags: [String] = []
        for tag in documents.flatMap(\.tags) where !seenTags.contains(tag) {
            seenTags.insert(tag)
            topicTags.append(tag)
            if topicTags.count == 5 {
                break
            }
        }

        let topicValue = topicTags.isEmpty ? "Agent / SFT / RL / OPD / Safety" : topicTags.joined(separator: " / ")
        return [
            ShowcaseStat(id: "fixed-channels", label: "固定分类", value: "3"),
            ShowcaseStat(id: "markdown-briefs", label: "Markdown 深度稿", value: String(documents.count)),
            ShowcaseStat(id: "tracked-topics", label: "重点方法", value: topicValue)
        ]
    }

    private func itemCountsBySource(_ items: [JSONRecord]) -> [String: Int] {
        var counts: [String: Int] = [:]
        for item in items {
            let id = string(item["source_id"]) ?? "unknown-source"
            counts[id, default: 0] += 1
        }
        return counts
    }

    private func sourcesByID(_ sources: [JSONRecord]) -> [String: JSONRecord] {
        var index: [String: JSONRecord] = [:]
        for source in sources {
            if let id = string(source["id"]) ?? string(source["source_id"]) {
                index[id] = source
            }
        }
        return index
    }

    private func findManifestPath(
        _ files: [JSONRecord],
        matching predicate: (String) -> Bool
    ) -> String? {
        let file = files.first { entry in
            predicate(string(entry["path"]) ?? "")
        }
        return string(file?["path"])
    }

    private func analysisMarkdownPath(item: JSONRecord, index: Int, generatedAt: Date) -> String {
        if let path = string(item["analysis_markdown_path"]) {
            return path
        }

        let id = string(item["item_id"]) ?? string(item["id"]) ?? "item-\(index + 1)"
        let publishedAt = dateValue(item["sort_at"])
            ?? dateValue(item["published_at"])
            ?? dateValue(item["fetched_at"])
            ?? generatedAt
        return articleMarkdownPath(publishedAt: publishedAt, id: id)
    }

    private func articleMarkdownPath(publishedAt: Date, id: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy/MM/dd"
        return "articles/\(formatter.string(from: publishedAt))/\(id)/index.md"
    }

    private func readJSON(_ url: URL) throws -> JSONRecord {
        let data = try Data(contentsOf: url)
        guard let record = try JSONSerialization.jsonObject(with: data) as? JSONRecord else {
            throw PublicDataLoaderError.invalidJSON(url)
        }
        return record
    }

    private func readJSONL(_ url: URL) throws -> [JSONRecord] {
        let text = try String(contentsOf: url, encoding: .utf8)
        return try text
            .split(separator: "\n", omittingEmptySubsequences: false)
            .enumerated()
            .compactMap { index, line in
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else {
                    return nil
                }

                let data = Data(trimmed.utf8)
                guard let record = try JSONSerialization.jsonObject(with: data) as? JSONRecord else {
                    throw PublicDataLoaderError.invalidJSONL(url, line: index + 1)
                }
                return record
            }
    }

    private func readRemoteJSON(_ url: URL) async throws -> JSONRecord {
        let data = try await readRemoteData(url)
        guard let record = try JSONSerialization.jsonObject(with: data) as? JSONRecord else {
            throw PublicDataLoaderError.invalidJSON(url)
        }
        return record
    }

    private func readRemoteJSONL(_ url: URL) async throws -> [JSONRecord] {
        let data = try await readRemoteData(url)
        let text = String(decoding: data, as: UTF8.self)
        return try text
            .split(separator: "\n", omittingEmptySubsequences: false)
            .enumerated()
            .compactMap { index, line in
                let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else {
                    return nil
                }

                let data = Data(trimmed.utf8)
                guard let record = try JSONSerialization.jsonObject(with: data) as? JSONRecord else {
                    throw PublicDataLoaderError.invalidJSONL(url, line: index + 1)
                }
                return record
            }
    }

    private func readRemoteText(_ url: URL) async throws -> String {
        String(decoding: try await readRemoteData(url), as: UTF8.self)
    }

    private func readRemoteData(_ url: URL) async throws -> Data {
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            if let httpResponse = response as? HTTPURLResponse,
               !(200..<300).contains(httpResponse.statusCode) {
                throw PublicDataLoaderError.failedToLoadRemote(url)
            }
            return data
        } catch let error as PublicDataLoaderError {
            throw error
        } catch {
            throw PublicDataLoaderError.failedToLoadRemote(url)
        }
    }

    private func localURL(root: URL, relativePath: String) throws -> URL {
        try validateRelativePath(relativePath)
        let rootURL = root.standardizedFileURL
        let target = rootURL.appendingPathComponent(relativePath).standardizedFileURL
        let rootPath = rootURL.path
        guard target.path == rootPath || target.path.hasPrefix("\(rootPath)/") else {
            throw PublicDataLoaderError.unsafePublicPath(relativePath)
        }
        return target
    }

    private func remoteURL(baseURL: URL, relativePath: String) throws -> URL {
        try validateRelativePath(relativePath)
        let base = baseURL.absoluteString.hasSuffix("/") ? baseURL : baseURL.appendingPathComponent("")
        guard let url = URL(string: relativePath, relativeTo: base)?.absoluteURL else {
            throw PublicDataLoaderError.unsafePublicPath(relativePath)
        }
        return url
    }

    private func validateRelativePath(_ relativePath: String) throws {
        let components = relativePath.split(separator: "/", omittingEmptySubsequences: false)
        if relativePath.hasPrefix("/") || components.contains("..") {
            throw PublicDataLoaderError.unsafePublicPath(relativePath)
        }
    }

    private func records(_ value: Any?) -> [JSONRecord] {
        (value as? [Any])?.compactMap { $0 as? JSONRecord } ?? []
    }

    private func stringArray(_ value: Any?) -> [String] {
        (value as? [Any])?.compactMap { string($0) } ?? []
    }

    private func string(_ value: Any?) -> String? {
        guard let string = value as? String else {
            return nil
        }
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func int(_ value: Any?, fallback: Int) -> Int {
        switch value {
        case let int as Int:
            return int
        case let double as Double where double.isFinite:
            return Int(double.rounded())
        case let number as NSNumber:
            return number.intValue
        default:
            return fallback
        }
    }

    private func bool(_ value: Any?, fallback: Bool) -> Bool {
        switch value {
        case let bool as Bool:
            return bool
        case let number as NSNumber:
            return number.boolValue
        default:
            return fallback
        }
    }

    private func urlValue(_ value: Any?) -> URL? {
        string(value).flatMap(URL.init(string:))
    }

    private func dateValue(_ value: Any?) -> Date? {
        string(value).flatMap(DailyReportDateParser.parse)
    }

    private func hostname(_ url: URL) -> String {
        let host = url.host(percentEncoded: false) ?? "daily-report.local"
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
