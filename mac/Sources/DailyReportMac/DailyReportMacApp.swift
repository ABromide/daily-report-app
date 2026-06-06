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
            CommandMenu("Reports") {
                Button("Open Command Panel") {
                    model.isCommandPanelPresented = true
                }
                .keyboardShortcut("k", modifiers: [.command, .shift])

                Button("Refresh Fixture Cache") {
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
            Label("Daily Report", systemImage: model.syncStatus.systemImageName)
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
    @Published var selectedScope: ReportScope? = .all
    @Published var selectedReportID: ReportItem.ID?
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

    var reports: [ReportItem] {
        summary?.payload.reports.sorted { lhs, rhs in
            lhs.publishedAt > rhs.publishedAt
        } ?? []
    }

    var visibleReports: [ReportItem] {
        switch selectedScope ?? .all {
        case .all:
            return reports
        case .highSignal:
            return reports.filter { [.high, .critical].contains($0.importance) }
        case .stale:
            return syncStatus == .stale ? reports : []
        case .sources:
            return reports.filter { !$0.sources.isEmpty }
        case .local:
            return reports
        }
    }

    var selectedReport: ReportItem? {
        if let selectedReportID,
           let report = reports.first(where: { $0.id == selectedReportID }) {
            return report
        }

        return visibleReports.first
    }

    var sourceHealth: [SourceHealth] {
        summary?.payload.sourceHealth ?? []
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
                syncStatus = .syncing
                try await refresh()
            }
        } catch {
            syncStatus = .failed
            errorMessage = error.localizedDescription
        }

        startBackgroundImport()
    }

    func refresh() async throws {
        syncStatus = .syncing
        do {
            let result = try await importer.importPayload(from: .bundledFixture)
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

    func selectFirstVisibleReport() {
        selectedReportID = visibleReports.first?.id
    }

    private func apply(summary: CachedSummary) {
        self.summary = summary
        syncStatus = summary.effectiveStatus
        errorMessage = summary.errorMessage

        if selectedReportID == nil || !reports.contains(where: { $0.id == selectedReportID }) {
            selectedReportID = reports.first?.id
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
}

enum ReportScope: String, CaseIterable, Identifiable {
    case all
    case highSignal
    case stale
    case sources
    case local

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "All Reports"
        case .highSignal:
            return "High Signal"
        case .stale:
            return "Stale"
        case .sources:
            return "Sources"
        case .local:
            return "Local"
        }
    }

    var systemImageName: String {
        switch self {
        case .all:
            return "tray.full"
        case .highSignal:
            return "bolt.horizontal"
        case .stale:
            return "clock.badge.exclamationmark"
        case .sources:
            return "link"
        case .local:
            return "externaldrive"
        }
    }
}

struct DailyReportRootView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        NavigationSplitView(columnVisibility: $model.columnVisibility) {
            SidebarView()
        } content: {
            ReportFeedView()
        } detail: {
            ReaderDetailView(report: model.selectedReport)
        }
        .frame(minWidth: 1080, minHeight: 720)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                SyncStatusBadge(status: model.syncStatus)

                Button {
                    Task {
                        await model.refreshIgnoringErrors()
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .help("Refresh fixture cache")

                Button {
                    model.isCommandPanelPresented = true
                } label: {
                    Label("Commands", systemImage: "command")
                }
                .help("Open command panel")
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
        List(selection: $model.selectedScope) {
            Section("Research") {
                ForEach(ReportScope.allCases) { scope in
                    Label(scope.title, systemImage: scope.systemImageName)
                        .tag(Optional(scope))
                }
            }

            Section("Sync") {
                Label(model.syncStatus.displayName, systemImage: model.syncStatus.systemImageName)
                if let generatedAt = model.summary?.payload.manifest.generatedAt {
                    Label(generatedAt.formatted(date: .abbreviated, time: .shortened), systemImage: "calendar")
                }
            }
        }
        .navigationTitle("Daily Report")
    }
}

struct ReportFeedView: View {
    @EnvironmentObject private var model: ReportAppModel

    var body: some View {
        List(selection: $model.selectedReportID) {
            ForEach(model.visibleReports) { report in
                ReportRow(report: report)
                    .tag(Optional(report.id))
            }
        }
        .navigationTitle(model.selectedScope?.title ?? "Reports")
        .overlay {
            if model.visibleReports.isEmpty {
                EmptyStateView(
                    title: "No Reports",
                    systemImageName: "tray",
                    description: "The current scope has no cached reports."
                )
            }
        }
        .onChange(of: model.selectedScope) { _ in
            model.selectFirstVisibleReport()
        }
    }
}

struct ReportRow: View {
    let report: ReportItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(report.title)
                    .font(.headline)
                    .lineLimit(2)

                Spacer()

                Text(report.importance.displayName)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(report.summary)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(3)

            HStack(spacing: 6) {
                Label("\(report.readingTimeMinutes)m", systemImage: "timer")
                Label(report.publishedAt.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 6)
    }
}

struct ReaderDetailView: View {
    @EnvironmentObject private var model: ReportAppModel
    let report: ReportItem?

    var body: some View {
        ZStack {
            KamiTokens.parchment.ignoresSafeArea()

            if let report {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(report.title)
                                    .font(.system(.largeTitle, design: .serif, weight: .semibold))
                                    .foregroundStyle(KamiTokens.inkBlue)

                                Text(report.summary)
                                    .font(.title3)
                                    .foregroundStyle(KamiTokens.bodyText)
                                    .fixedSize(horizontal: false, vertical: true)
                            }

                            Spacer()

                            SyncStatusBadge(status: model.syncStatus)
                        }

                        HStack(spacing: 8) {
                            ForEach(report.tags, id: \.self) { tag in
                                Text(tag)
                                    .font(.caption)
                                    .foregroundStyle(KamiTokens.inkBlue)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(KamiTokens.ivory)
                                    .clipShape(Capsule())
                            }
                        }

                        Divider()
                            .overlay(KamiTokens.warmBorder)

                        Text(report.bodyMarkdown)
                            .font(.system(.body, design: .serif))
                            .lineSpacing(5)
                            .foregroundStyle(KamiTokens.bodyText)
                            .fixedSize(horizontal: false, vertical: true)

                        VStack(alignment: .leading, spacing: 12) {
                            Text("Evidence")
                                .font(.headline)
                                .foregroundStyle(KamiTokens.inkBlue)

                            ForEach(report.sources) { source in
                                EvidenceSourceRow(source: source)
                            }
                        }

                        if !model.sourceHealth.isEmpty {
                            SourceHealthStrip(sources: model.sourceHealth)
                        }
                    }
                    .padding(32)
                    .frame(maxWidth: 820, alignment: .leading)
                }
            } else {
                EmptyStateView(
                    title: "Select a Report",
                    systemImageName: "doc.text.magnifyingglass",
                    description: "Cached research will appear in the reader."
                )
            }
        }
        .navigationTitle("Reader")
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

struct SourceHealthStrip: View {
    let sources: [SourceHealth]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Source Health")
                .font(.headline)
                .foregroundStyle(KamiTokens.inkBlue)

            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
                ForEach(sources) { source in
                    GridRow {
                        Text(source.name)
                            .foregroundStyle(KamiTokens.bodyText)
                        Text(source.status.displayName)
                            .foregroundStyle(.secondary)
                        Text("\(source.itemCount)")
                            .foregroundStyle(.secondary)
                    }
                    .font(.caption)
                }
            }
        }
        .padding(12)
        .background(KamiTokens.ivory)
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(KamiTokens.warmBorder)
        }
    }
}

struct CommandPanelShell: View {
    @EnvironmentObject private var model: ReportAppModel
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            TextField("Command", text: $query)
                .textFieldStyle(.roundedBorder)

            List {
                Button {
                    Task {
                        await model.refreshIgnoringErrors()
                    }
                    dismiss()
                } label: {
                    Label("Refresh fixture cache", systemImage: "arrow.clockwise")
                }

                Button {
                    model.selectedScope = .highSignal
                    model.selectFirstVisibleReport()
                    dismiss()
                } label: {
                    Label("Show high signal reports", systemImage: "bolt.horizontal")
                }

                Button {
                    model.selectedScope = .sources
                    model.selectFirstVisibleReport()
                    dismiss()
                } label: {
                    Label("Inspect sources", systemImage: "link")
                }
            }
            .listStyle(.inset)
        }
        .padding(18)
        .frame(width: 460, height: 260)
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
            Label("Refresh Fixture Cache", systemImage: "arrow.clockwise")
        }

        Divider()

        Label(model.syncStatus.displayName, systemImage: model.syncStatus.systemImageName)

        if let report = model.reports.first {
            Divider()
            Text(report.title)
            Text(report.summary)
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

enum KamiTokens {
    static let parchment = Color(red: 0.961, green: 0.957, blue: 0.929)
    static let ivory = Color(red: 0.980, green: 0.976, blue: 0.961)
    static let inkBlue = Color(red: 0.106, green: 0.212, blue: 0.365)
    static let bodyText = Color(red: 0.173, green: 0.153, blue: 0.125)
    static let warmBorder = Color(red: 0.784, green: 0.733, blue: 0.627)
}
