import { renderShowcaseArticleMarkdown } from "../../../../../../../lib/articleAnalysisMarkdown";
import { getShowcaseData } from "../../../../../../../lib/showcaseContent";

type ShowcaseData = ReturnType<typeof getShowcaseData>;
type ShowcaseItem = ShowcaseData["documents"][number];
type ShowcaseCluster = ShowcaseData["clusters"][number];

export function getStaticPaths() {
  const data = getShowcaseData("zh");

  return data.documents.map((item) => {
    const [year, month, day] = item.analysisMarkdownPath.split("/").slice(1, 4);

    return {
      params: { year, month, day, id: item.id },
      props: {
        item,
        cluster: data.clusters.find((entry) => entry.id === item.clusterId)
      }
    };
  });
}

export function GET({ props }: { props: { item: ShowcaseItem; cluster?: ShowcaseCluster } }) {
  return new Response(props.item.analysisMarkdown ?? renderShowcaseArticleMarkdown(props.item, props.cluster), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8"
    }
  });
}
