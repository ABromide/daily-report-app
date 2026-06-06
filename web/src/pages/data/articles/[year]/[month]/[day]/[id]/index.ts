import { renderShowcaseArticleHtml } from "../../../../../../../lib/articleAnalysisHtml";
import { getShowcaseData } from "../../../../../../../lib/showcaseContent";

type ShowcaseData = ReturnType<typeof getShowcaseData>;
type ShowcaseItem = ShowcaseData["documents"][number];
type ShowcaseCluster = ShowcaseData["clusters"][number];

export function getStaticPaths() {
  const data = getShowcaseData("zh");

  return data.documents.map((item) => {
    const [year, month, day] = item.analysisHtmlPath.split("/").slice(1, 4);

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
  return new Response(renderShowcaseArticleHtml(props.item, props.cluster), {
    headers: {
      "Content-Type": "text/html; charset=utf-8"
    }
  });
}
