import DailyReportCore
import SwiftUI

@main
struct DailyReportMacApp: App {
    @StateObject private var model = ReportAppModel()

    var body: some Scene {
        WindowGroup {
            DailyReportRootView()
                .environmentObject(model)
                .task {
                    await model.boot()
                }
        }
        .commands {
            CommandMenu("日报 / Daily Report") {
                Button("打开命令面板 / Command Panel") {
                    model.isCommandPanelPresented = true
                }
                .keyboardShortcut("k", modifiers: [.command, .shift])

                Button("刷新公开数据 / Refresh Public Data") {
                    Task {
                        await model.refreshIgnoringErrors()
                    }
                }
                .keyboardShortcut("r", modifiers: [.command])
            }
        }

        MenuBarExtra {
            MenuBarReportView()
                .environmentObject(model)
        } label: {
            Label("AI 研究日报 / Daily Report", systemImage: model.syncStatus.systemImageName)
        }
        .menuBarExtraStyle(.menu)
    }
}

@MainActor
final class ReportAppModel: ObservableObject {
    @Published private(set) var summary: CachedSummary?
    @Published private(set) var syncStatus: SyncStatus = .localOnly
    @Published private(set) var errorMessage: String?
    @Published var columnVisibility: NavigationSplitViewVisibility = .all
    @Published var selectedFilterID: String? = ShowcaseFilterID.all
    @Published var selectedDocumentID: ShowcaseDocument.ID?
    @Published var searchText = ""
    @Published var isCommandPanelPresented = false

    private let store: SummaryCacheStore
    private let importer: ImportService
    private var booted = false
    private var backgroundTask: Task<Void, Never>?

    init(
        store: SummaryCacheStore = SummaryCacheStore(),
        importer: ImportService? = nil
    ) {
        self.store = store
        self.importer = importer ?? ImportService(store: store)
    }

    deinit {
        backgroundTask?.cancel()
    }

    var payload: DailyReportPayload? {
        summary?.payload
    }

    var documents: [ShowcaseDocument] {
        payload?.documents.sorted { lhs, rhs in
            lhs.publishedAt > rhs.publishedAt
        } ?? []
    }

    var clusters: [ShowcaseCluster] {
        payload?.clusters ?? []
    }

    var sources: [ShowcaseSource] {
        payload?.sources ?? []
    }

    var stats: [ShowcaseStat] {
        payload?.stats ?? []
    }

    var visibleDocuments: [ShowcaseDocument] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return documents.filter { document in
            matchesSelectedFilter(document) && (query.isEmpty || document.searchText.contains(query))
        }
    }

    var selectedDocument: ShowcaseDocument? {
        if let selectedDocumentID,
           let document = documents.first(where: { $0.id == selectedDocumentID }),
           visibleDocuments.contains(where: { $0.id == document.id }) {
            return document
        }

        return visibleDocuments.first
    }

    var activeFilterTitle: String {
        guard let selectedFilterID else {
            return "全部更新 / All Updates"
        }

        if selectedFilterID == ShowcaseFilterID.all {
            return "全部更新 / All Updates"
        }

        if let clusterID = ShowcaseFilterID.clusterID(from: selectedFilterID) {
            return clusterID.title
        }

        if let type = ShowcaseFilterID.contentType(from: selectedFilterID) {
            return type.displayName
        }

        return "全部更新 / All Updates"
    }

    var dataStatusLine: String {
        guard let payload else {
            return "等待同步 / Waiting for sync"
        }

        return "\(payload.dataMode.displayName) · \(payload.dataPath)"
    }

    func boot() async {
        guard !booted else {
            return
        }
        booted = true

        do {
            if let cached = try await store.load() {
                apply(summary: cached)
            } else {
                try await refresh()
            }
        } catch {
            errorMessage = "缓存不可用，正在重新同步。/ Cache could not be loaded; refreshing."
            try? await refresh()
        }

        startBackgroundImport()
    }

    func refresh() async throws {
        syncStatus = .syncing
        do {
            let source = ImportService.defaultPublicDataSource()
            let status: SyncStatus = source == .bundledFixture ? .localOnly : .cached
            let result = try await importer.importPayload(from: source, status: status)
            apply(summary: result.summary)
        } catch {
            syncStatus = .failed
            errorMessage = error.localizedDescription
            throw error
        }
    }

    func refreshIgnoringErrors() async {
        try? await refresh()
    }

    func selectFilter(_ id: String) {
        selectedFilterID = id
        selectFirstVisibleDocument()
    }

    func selectFirstVisibleDocument() {
        selectedDocumentID = visibleDocuments.first?.id
    }

    func count(for filterID: String) -> Int {
        documents.filter { document in
            matches(document, filterID: filterID)
        }.count
    }

    private func apply(summary: CachedSummary) {
        self.summary = summary
        syncStatus = summary.effectiveStatus
        errorMessage = summary.errorMessage

        if selectedDocumentID == nil || !documents.contains(where: { $0.id == selectedDocumentID }) {
            selectedDocumentID = documents.first?.id
        }
    }

    private func startBackgroundImport() {
        backgroundTask?.cancel()
        backgroundTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 15 * 60 * 1_000_000_000)
                await self?.refreshIgnoringErrors()
            }
        }
    }

    private func matchesSelectedFilter(_ document: ShowcaseDocument) -> Bool {
        matches(document, filterID: selectedFilterID ?? ShowcaseFilterID.all)
    }

    private func matches(_ document: ShowcaseDocument, filterID: String) -> Bool {
        if filterID == ShowcaseFilterID.all {
            return true
        }

        if let clusterID = ShowcaseFilterID.clusterID(from: filterID) {
            return document.clusterID == clusterID
        }

        if let type = ShowcaseFilterID.contentType(from: filterID) {
            return document.type == type
        }

        return true
    }
}

enum ShowcaseFilterID {
    static let all = "all"

    static func cluster(_ id: ContentClusterID) -> String {
        "cluster:\(id.rawValue)"
    }

    static func type(_ type: ContentType) -> String {
        "type:\(type.rawValue)"
    }

    static func clusterID(from value: String) -> ContentClusterID? {
        guard value.hasPrefix("cluster:") else {
            return nil
        }
        return ContentClusterID(rawValue: String(value.dropFirst("cluster:".count)))
    }

    static func contentType(from value: String) -> ContentType? {
        guard value.hasPrefix("type:") else {
            return nil
        }
        return ContentType(rawValue: String(value.dropFirst("type:".count)))
    }
}

struct DailyReportRootView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        HSplitView {
            SidebarView()
                .frame(minWidth: 220, idealWidth: 240, maxWidth: 300)

            TimelineView()
                .frame(minWidth: 420, idealWidth: 500, maxWidth: 620)

            DocumentDetailView(document: model.selectedDocument)
                .frame(minWidth: 640, maxWidth: .infinity)
        }
        .background(KamiTokens.parchment)
        .frame(minWidth: 1280, minHeight: 760)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                SyncStatusBadge(status: model.syncStatus)

                Button {
                    Task {
                        await model.refreshIgnoringErrors()
                    }
                } label: {
                    Label("刷新 / Refresh", systemImage: "arrow.clockwise")
                }
                .help("刷新公开数据")

                Button {
                    model.isCommandPanelPresented = true
                } label: {
                    Label("命令 / Commands", systemImage: "command")
                }
                .help("打开命令面板")
            }
        }
        .sheet(isPresented: $model.isCommandPanelPresented) {
            CommandPanelShell()
                .environmentObject(model)
        }
    }
}

struct SidebarView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        List(selection: $model.selectedFilterID) {
            Section("时间线 / Timeline") {
                Label("全部更新 / All Updates", systemImage: "clock")
                    .badge(model.documents.count)
                    .tag(Optional(ShowcaseFilterID.all))
            }

            Section("固定频道 / Channels") {
                ForEach(model.clusters) { cluster in
                    Label(cluster.title, systemImage: cluster.id.systemImageName)
                        .badge(cluster.documentCount)
                        .tag(Optional(ShowcaseFilterID.cluster(cluster.id)))
                }
            }

            Section("内容类型 / Types") {
                ForEach(ContentType.allCases) { type in
                    Label(type.displayName, systemImage: type.systemImageName)
                        .badge(model.count(for: ShowcaseFilterID.type(type)))
                        .tag(Optional(ShowcaseFilterID.type(type)))
                }
            }

            Section("同步 / Sync") {
                Label(model.syncStatus.displayName, systemImage: model.syncStatus.systemImageName)

                if let generatedAt = model.payload?.generatedAt {
                    Label(generatedAt.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                }

                Text(model.dataStatusLine)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
        }
        .navigationTitle("AI 研究日报")
        .listStyle(.sidebar)
        .onChange(of: model.selectedFilterID) { _ in
            model.selectFirstVisibleDocument()
        }
    }
}

struct TimelineView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            TimelineHeader()
                .padding([.horizontal, .top], 20)
                .padding(.bottom, 12)

            if !model.stats.isEmpty {
                StatStrip(stats: model.stats)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)
            }

            List(selection: $model.selectedDocumentID) {
                ForEach(model.visibleDocuments) { document in
                    DocumentRow(document: document)
                        .tag(Optional(document.id))
                }
            }
            .listStyle(.inset)
            .overlay {
                if model.visibleDocuments.isEmpty {
                    EmptyStateView(
                        title: "没有找到匹配内容 / No Matches",
                        systemImageName: "magnifyingglass",
                        description: "换个关键词，或者回到全部更新。"
                    )
                }
            }
        }
        .background(Color(nsColor: .windowBackgroundColor))
        .navigationTitle(model.activeFilterTitle)
        .onChange(of: model.searchText) { _ in
            model.selectFirstVisibleDocument()
        }
    }
}

struct TimelineHeader: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("AI 研究日报")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(KamiTokens.inkBlue)
                    .textCase(.uppercase)

                Text("三类 AI 前沿内容：Agent、后训练、安全")
                    .font(.system(.title2, design: .serif, weight: .semibold))
                    .foregroundStyle(KamiTokens.inkBlue)

                Text("按发布时间倒序展示公开论文、博客、代码和 AI 报告；选择任意内容后，在右侧检查 Markdown 深度稿和证据链。")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 10) {
                Label(model.payload?.dataMode.displayName ?? "未同步", systemImage: model.syncStatus.systemImageName)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(KamiTokens.inkBlue)

                if let generatedAt = model.payload?.generatedAt {
                    Text(generatedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                TextField("搜索 Agent、SFT、AI 安全、论文或代码", text: $model.searchText)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(KamiTokens.ivory)
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(KamiTokens.warmBorder)
            }
        }
    }
}

struct StatStrip: View {
    let stats: [ShowcaseStat]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], spacing: 8) {
            ForEach(stats) { stat in
                VStack(alignment: .leading, spacing: 4) {
                    Text(stat.label)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(stat.value)
                        .font(.headline)
                        .foregroundStyle(KamiTokens.inkBlue)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
                .padding(10)
                .background(KamiTokens.ivory)
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(KamiTokens.warmBorder)
                }
            }
        }
    }
}

struct DocumentRow: View {
    let document: ShowcaseDocument

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 8) {
                Text("\(document.score)")
                    .font(.caption.weight(.bold).monospacedDigit())
                    .foregroundStyle(KamiTokens.inkBlue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(KamiTokens.ivory)
                    .clipShape(Capsule())

                Text(document.typeLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(KamiTokens.inkBlue)

                Text(document.clusterID.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(document.publishedAt.formatted(date: .abbreviated, time: .omitted))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(document.title)
                .font(.headline)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            Text(document.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 10) {
                Label(document.sourceName, systemImage: "link")
                    .lineLimit(1)
                Label("\(document.readingMinutes) 分钟", systemImage: "timer")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 10)
    }
}

struct DocumentDetailView: View {
    let document: ShowcaseDocument?

    var body: some View {
        ZStack {
            KamiTokens.parchment.ignoresSafeArea()

            if let document {
                ScrollView {
                    HStack(alignment: .top) {
                        Spacer(minLength: 24)

                        VStack(alignment: .leading, spacing: 24) {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack(spacing: 8) {
                                    Text(document.typeLabel)
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(KamiTokens.inkBlue)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(KamiTokens.ivory)
                                        .clipShape(Capsule())

                                    Text(document.clusterID.title)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }

                                Text(document.title)
                                    .font(.system(.title, design: .serif, weight: .semibold))
                                    .foregroundStyle(KamiTokens.inkBlue)
                                    .fixedSize(horizontal: false, vertical: true)

                                Text(document.summary)
                                    .font(.title3)
                                    .foregroundStyle(KamiTokens.bodyText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            MetadataStrip(document: document)
                            TagCloud(tags: document.tags)

                            Divider()
                                .overlay(KamiTokens.warmBorder)

                            MarkdownBody(markdown: document.analysisMarkdown ?? document.analysis.ifEmpty(document.summary))

                            VStack(alignment: .leading, spacing: 12) {
                                Text("证据 / Evidence")
                                    .font(.headline)
                                    .foregroundStyle(KamiTokens.inkBlue)

                                ForEach(document.evidence) { source in
                                    EvidenceSourceRow(source: source)
                                }
                            }

                            Link(destination: document.url) {
                                Label("打开原文 / Open source", systemImage: "arrow.up.right.square")
                            }
                            .buttonStyle(.bordered)
                        }
                        .frame(maxWidth: 760, alignment: .leading)
                        .padding(.vertical, 34)

                        Spacer(minLength: 24)
                    }
                }
            } else {
                EmptyStateView(
                    title: "选择一条内容 / Select an Item",
                    systemImageName: "doc.text.magnifyingglass",
                    description: "同步后的 Markdown 深度稿会出现在这里。"
                )
            }
        }
        .navigationTitle("深度解析 / Analysis")
    }
}

struct MetadataStrip: View {
    let document: ShowcaseDocument

    var body: some View {
        Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 8) {
            GridRow {
                Label(document.publishedAt.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                Label(document.sourceName, systemImage: "building.2")
            }

            GridRow {
                Label(document.domain, systemImage: "network")
                Label("\(document.readingMinutes) 分钟", systemImage: "timer")
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

struct TagCloud: View {
    let tags: [String]

    var body: some View {
        FlowLayout(alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.caption)
                    .foregroundStyle(KamiTokens.inkBlue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(KamiTokens.ivory)
                    .clipShape(Capsule())
            }
        }
    }
}

struct MarkdownBody: View {
    let markdown: String

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                MarkdownBlockView(block: block)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var blocks: [MarkdownBlock] {
        MarkdownBlock.parse(markdown)
    }
}

struct MarkdownBlockView: View {
    let block: MarkdownBlock

    var body: some View {
        switch block.kind {
        case .heading1:
            Text(block.text)
                .font(.system(.title2, design: .serif, weight: .semibold))
                .foregroundStyle(KamiTokens.inkBlue)
                .padding(.top, 8)
        case .heading2:
            Text(block.text)
                .font(.system(.title3, design: .serif, weight: .semibold))
                .foregroundStyle(KamiTokens.inkBlue)
                .padding(.top, 6)
        case .heading3:
            Text(block.text)
                .font(.headline)
                .foregroundStyle(KamiTokens.inkBlue)
                .padding(.top, 4)
        case .code:
            Text(block.text)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(KamiTokens.bodyText)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(KamiTokens.ivory)
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(KamiTokens.warmBorder)
                }
        case .paragraph:
            Text(renderedMarkdown)
                .font(.system(.body, design: .serif))
                .lineSpacing(7)
                .foregroundStyle(KamiTokens.bodyText)
        }
    }

    private var renderedMarkdown: AttributedString {
        (try? AttributedString(markdown: block.text)) ?? AttributedString(block.text)
    }
}

struct MarkdownBlock {
    enum Kind {
        case heading1
        case heading2
        case heading3
        case paragraph
        case code
    }

    var kind: Kind
    var text: String

    static func parse(_ markdown: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var codeLines: [String] = []
        var inCodeBlock = false

        func flushParagraph() {
            let text = paragraph
                .joined(separator: "\n")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                blocks.append(MarkdownBlock(kind: .paragraph, text: text))
            }
            paragraph.removeAll()
        }

        for rawLine in markdown.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)

            if line.hasPrefix("```") {
                if inCodeBlock {
                    blocks.append(MarkdownBlock(kind: .code, text: codeLines.joined(separator: "\n")))
                    codeLines.removeAll()
                    inCodeBlock = false
                } else {
                    flushParagraph()
                    inCodeBlock = true
                }
                continue
            }

            if inCodeBlock {
                codeLines.append(rawLine)
                continue
            }

            guard !line.isEmpty else {
                flushParagraph()
                continue
            }

            if line.hasPrefix("### ") {
                flushParagraph()
                blocks.append(MarkdownBlock(kind: .heading3, text: String(line.dropFirst(4))))
            } else if line.hasPrefix("## ") {
                flushParagraph()
                blocks.append(MarkdownBlock(kind: .heading2, text: String(line.dropFirst(3))))
            } else if line.hasPrefix("# ") {
                flushParagraph()
                blocks.append(MarkdownBlock(kind: .heading1, text: String(line.dropFirst(2))))
            } else {
                paragraph.append(rawLine)
            }
        }

        if inCodeBlock {
            blocks.append(MarkdownBlock(kind: .code, text: codeLines.joined(separator: "\n")))
        }
        flushParagraph()

        return blocks.isEmpty ? [MarkdownBlock(kind: .paragraph, text: markdown)] : blocks
    }
}

struct EmptyStateView: View {
    let title: String
    let systemImageName: String
    let description: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: systemImageName)
                .font(.largeTitle)
                .foregroundStyle(.secondary)

            Text(title)
                .font(.headline)

            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(24)
    }
}

struct EvidenceSourceRow: View {
    let source: EvidenceSource

    var body: some View {
        Link(destination: source.url) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "link.circle")
                    .foregroundStyle(KamiTokens.inkBlue)

                VStack(alignment: .leading, spacing: 3) {
                    Text(source.title)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(KamiTokens.bodyText)
                    Text(source.host)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
            .padding(10)
            .background(KamiTokens.ivory)
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(KamiTokens.warmBorder)
            }
        }
        .buttonStyle(.plain)
    }
}

struct CommandPanelShell: View {
    @EnvironmentObject private var model: ReportAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var command = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("输入命令或搜索词 / Command or search", text: $command)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    model.searchText = command
                    dismiss()
                }

            List {
                Button {
                    Task {
                        await model.refreshIgnoringErrors()
                    }
                    dismiss()
                } label: {
                    Label("刷新公开数据 / Refresh public data", systemImage: "arrow.clockwise")
                }

                Button {
                    model.searchText = command
                    dismiss()
                } label: {
                    Label("使用搜索词 / Apply search text", systemImage: "magnifyingglass")
                }

                Button {
                    model.selectFilter(ShowcaseFilterID.all)
                    model.searchText = ""
                    dismiss()
                } label: {
                    Label("回到全部更新 / Show all updates", systemImage: "clock")
                }

                ForEach(ContentClusterID.allCases) { cluster in
                    Button {
                        model.selectFilter(ShowcaseFilterID.cluster(cluster))
                        dismiss()
                    } label: {
                        Label(cluster.title, systemImage: cluster.systemImageName)
                    }
                }
            }
            .listStyle(.inset)
        }
        .padding(18)
        .frame(width: 500, height: 360)
    }
}

struct MenuBarReportView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        Button {
            Task {
                await model.refreshIgnoringErrors()
            }
        } label: {
            Label("刷新公开数据 / Refresh Public Data", systemImage: "arrow.clockwise")
        }

        Divider()

        Label(model.syncStatus.displayName, systemImage: model.syncStatus.systemImageName)

        if let document = model.documents.first {
            Divider()
            Text(document.title)
            Text(document.summary)
                .foregroundStyle(.secondary)
        }
    }
}

struct SyncStatusBadge: View {
    let status: SyncStatus

    var body: some View {
        Label(status.displayName, systemImage: status.systemImageName)
            .font(.caption.weight(.medium))
            .foregroundStyle(statusColor)
            .labelStyle(.titleAndIcon)
            .help(status.displayName)
    }

    private var statusColor: Color {
        switch status {
        case .cached:
            return .green
        case .stale:
            return .orange
        case .syncing:
            return .blue
        case .failed:
            return .red
        case .localOnly:
            return .secondary
        }
    }
}

struct FlowLayout: Layout {
    var alignment: HorizontalAlignment = .leading
    var spacing: CGFloat = 8

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        layout(in: proposal.replacingUnspecifiedDimensions().width, subviews: subviews).size
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let result = layout(in: bounds.width, subviews: subviews)
        for row in result.rows {
            let rowWidth = row.items.reduce(CGFloat.zero) { $0 + $1.size.width } + CGFloat(max(row.items.count - 1, 0)) * spacing
            let xOffset: CGFloat
            switch alignment {
            case .center:
                xOffset = max((bounds.width - rowWidth) / 2, 0)
            case .trailing:
                xOffset = max(bounds.width - rowWidth, 0)
            default:
                xOffset = 0
            }

            var x = bounds.minX + xOffset
            for item in row.items {
                subviews[item.index].place(
                    at: CGPoint(x: x, y: bounds.minY + row.y),
                    proposal: ProposedViewSize(item.size)
                )
                x += item.size.width + spacing
            }
        }
    }

    private func layout(in maxWidth: CGFloat, subviews: Subviews) -> (rows: [FlowRow], size: CGSize) {
        var rows: [FlowRow] = []
        var current = FlowRow(y: 0, height: 0, items: [])
        var x: CGFloat = 0
        let width = max(maxWidth, 1)

        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if x > 0, x + size.width > width {
                rows.append(current)
                current = FlowRow(y: current.y + current.height + spacing, height: 0, items: [])
                x = 0
            }

            current.items.append(FlowItem(index: index, size: size))
            current.height = max(current.height, size.height)
            x += size.width + spacing
        }

        if !current.items.isEmpty {
            rows.append(current)
        }

        let height = rows.last.map { $0.y + $0.height } ?? 0
        return (rows, CGSize(width: width, height: height))
    }

    private struct FlowRow {
        var y: CGFloat
        var height: CGFloat
        var items: [FlowItem]
    }

    private struct FlowItem {
        var index: Int
        var size: CGSize
    }
}

enum KamiTokens {
    static let parchment = Color(red: 0.961, green: 0.957, blue: 0.929)
    static let ivory = Color(red: 0.980, green: 0.976, blue: 0.961)
    static let inkBlue = Color(red: 0.106, green: 0.212, blue: 0.365)
    static let bodyText = Color(red: 0.173, green: 0.153, blue: 0.125)
    static let warmBorder = Color(red: 0.784, green: 0.733, blue: 0.627)
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
