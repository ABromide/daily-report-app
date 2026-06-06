// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "DailyReportMac",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(
            name: "DailyReportCore",
            targets: ["DailyReportCore"]
        ),
        .executable(
            name: "DailyReportMac",
            targets: ["DailyReportMac"]
        ),
        .executable(
            name: "DailyReportSmoke",
            targets: ["DailyReportSmoke"]
        )
    ],
    targets: [
        .target(
            name: "DailyReportCore",
            resources: [
                .process("Resources")
            ]
        ),
        .executableTarget(
            name: "DailyReportMac",
            dependencies: ["DailyReportCore"]
        ),
        .executableTarget(
            name: "DailyReportSmoke",
            dependencies: ["DailyReportCore"]
        )
    ]
)
