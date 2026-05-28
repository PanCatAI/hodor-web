<template>
  <div class="flowWrap">
    <VueFlow
      id="showFlow"
      v-model="nodes"
      :only-render-visible-elements="false"
      :nodes-draggable="true"
      :nodes-connectable="false"
      :nodes-focusable="false"
      :edges-focusable="false"
      :edges-updatable="false"
      :elevate-nodes-on-select="true"
      :elevate-edges-on-select="false"
      :disable-keyboard-a11y="true"
      :select-nodes-on-drag="false"
      :auto-pan-on-node-drag="false"
      :auto-pan-on-connect="false"
      :zoom-on-double-click="false"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :zoom-activation-key-code="null"
      :pan-activation-key-code="null"
      :default-edge-options="defaultEdgeOptions"
      :min-zoom="0.5"
      :max-zoom="2">
      <template #node-pluginNode>
        <pluginNode />
      </template>
      <Background />
      <Controls />
      <MiniMap pannable zoomable position="bottom-left" style="margin-left: 60px" />
      <Panel position="top-left">
        <t-select
          :value="episodesId"
          :placeholder="$t('workbench.production.selectPlaceholder')"
          autoWidth
          :options="episodesOptions"
          filterable
          @change="handleEpisodesChange">
          <template #label>
            <i-document-folder size="24" />
          </template>
        </t-select>
      </Panel>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import { VueFlow, Panel, type Node, type Edge } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { MiniMap } from "@vue-flow/minimap";
import { Controls } from "@vue-flow/controls";
import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import pluginNode from "@/components/edit/pluginNode.vue";
import { provideToonflowHost } from "@/utils/toonflowHost";

import productionAgentStore from "@/stores/productionAgent";
import projectStore from "@/stores/project";
const { project } = storeToRefs(projectStore());

// 向 UMD 节点注入宿主能力（show 模式：无选择器）
provideToonflowHost({ flowId: "showFlow" });

const defaultEdgeOptions = markRaw({
  type: "simple-bezier",
  animated: false,
  focusable: false,
  selectable: false,
  updatable: false,
  interactionWidth: 0,
});

// const nodes = shallowRef<Node[]>([
//   {
//     id: "1",
//     type: "pluginNode",
//     position: { x: 0, y: 0 },
//     data: {
//       pluginId: "toonflowPlugin:script",
//       data: {
//         script:
//           // "测试节点123123123123<tg><del>123</del><ins>好好好</ins></tg>这是一段普通文字，后面跟着修改内容<tg><del>旧文本内容</del><ins>新文本内容</ins></tg>，继续阅读下面的段落。\n\n第二段落开始，这里有<tg><del>需要删除的文字</del><ins>替换后的文字</ins></tg>，以及更多的<tg><del>错误描述</del><ins>正确描述</ins></tg>需要处理。\n\n在某些情况下<tg><del>原始版本A</del><ins>更新版本B</ins></tg>会出现连续修改，例如<tg><del>第一处修改</del><ins>修改一替换</ins></tg>紧接着<tg><del>第二处修改</del><ins>修改二替换</ins></tg>。\n\n段落末尾的修改<tg><del>末尾旧内容</del><ins>末尾新内容</ins></tg>\n\n<tg><del>开头就是修改内容</del><ins>开头替换为新内容</ins></tg>这是紧跟在修改后的普通文本。\n\n仅删除的情况：这段话里<tg><del>这部分将被删除</del><ins></ins></tg>不留任何替换。\n\n仅新增的情况：这里<tg><del></del><ins>插入全新的文字内容</ins></tg>是新插入的文字。\n\n较长内容的修改<tg><del>这是一段较长的旧文本，包含了很多需要被替换掉的内容描述</del><ins>这是替换后的新文本，经过精心修改和优化后的内容</ins></tg>继续后面的内容。",
//           "# 123",
//       },
//     },
//   },
//   {
//     id: "2",
//     type: "pluginNode",
//     position: { x: 650, y: 0 },
//     data: {
//       pluginId: "toonflowPlugin:assets",
//       data: {
//         assets: [
//           {
//             id: 1,
//             name: "勇者角色",
//             desc: "一位手持长剑的勇敢战士",
//             prompt: "a brave warrior holding a sword, fantasy style, detailed armor",
//             src: "https://picsum.photos/seed/role1/400/400",
//             state: "已完成",
//             type: "role",
//             flowId: 101,
//             errorReason: undefined,
//             derive: [
//               {
//                 id: 101,
//                 assetsId: 1,
//                 name: "勇者角色-变体1",
//                 prompt: "a brave warrior holding a sword, dark version",
//                 desc: "暗色风格变体",
//                 src: "https://picsum.photos/seed/role1_d1/400/400",
//                 flowId: 1011,
//                 state: "已完成",
//                 type: "role",
//               },
//               {
//                 id: 102,
//                 assetsId: 1,
//                 name: "勇者角色-变体2",
//                 prompt: "a brave warrior holding a sword, light version",
//                 desc: "亮色风格变体",
//                 src: "https://picsum.photos/seed/role1_d2/400/400",
//                 flowId: 1012,
//                 state: "生成中",
//                 type: "role",
//               },
//             ],
//           },
//           {
//             id: 2,
//             name: "魔法师",
//             desc: "身披紫袍的神秘魔法师",
//             prompt: "a mysterious mage in purple robe, holding magic staff, glowing effects",
//             src: "https://picsum.photos/seed/role2/400/400",
//             state: "已完成",
//             type: "role",
//             flowId: 102,
//             errorReason: undefined,
//             derive: [
//               {
//                 id: 201,
//                 assetsId: 2,
//                 name: "魔法师-变体1",
//                 prompt: "a mysterious mage, fire magic version",
//                 desc: "火焰魔法版本",
//                 src: "https://picsum.photos/seed/role2_d1/400/400",
//                 flowId: 2011,
//                 state: "已完成",
//                 type: "role",
//               },
//             ],
//           },
//           {
//             id: 3,
//             name: "神圣之剑",
//             desc: "散发着圣光的传说武器",
//             prompt: "a holy sword with divine light, legendary weapon, glowing runes",
//             src: "https://picsum.photos/seed/tool1/400/400",
//             state: "已完成",
//             type: "tool",
//             flowId: 103,
//             errorReason: undefined,
//             derive: [
//               {
//                 id: 301,
//                 assetsId: 3,
//                 name: "神圣之剑-变体1",
//                 prompt: "a holy sword, dark enchanted version",
//                 desc: "暗魔附魔版本",
//                 src: "https://picsum.photos/seed/tool1_d1/400/400",
//                 state: "生成失败",
//                 type: "tool",
//                 errorReason: "模型超时，请重试",
//               },
//             ],
//           },
//           {
//             id: 4,
//             name: "古老森林",
//             desc: "充满神秘气息的古老森林场景",
//             prompt: "an ancient mystical forest, fog, tall trees, fantasy atmosphere, detailed",
//             src: "https://picsum.photos/seed/scene1/800/450",
//             state: "已完成",
//             type: "scene",
//             flowId: 104,
//             errorReason: undefined,
//             derive: [
//               {
//                 id: 401,
//                 assetsId: 4,
//                 name: "古老森林-夜晚版",
//                 prompt: "an ancient mystical forest at night, moonlight, fog",
//                 desc: "夜晚月光版本",
//                 src: "https://picsum.photos/seed/scene1_d1/800/450",
//                 flowId: 4011,
//                 state: "已完成",
//                 type: "scene",
//               },
//               {
//                 id: 402,
//                 assetsId: 4,
//                 name: "古老森林-黄昏版",
//                 prompt: "an ancient mystical forest at sunset, golden light",
//                 desc: "黄昏金光版本",
//                 src: "https://picsum.photos/seed/scene1_d2/800/450",
//                 state: "未生成",
//                 type: "scene",
//               },
//             ],
//           },
//           {
//             id: 5,
//             name: "城堡废墟",
//             desc: "饱经沧桑的中世纪城堡废墟",
//             prompt: "a ruined medieval castle, broken walls, overgrown with vines, dramatic lighting",
//             src: "https://picsum.photos/seed/scene2/800/450",
//             state: "生成中",
//             type: "scene",
//             flowId: 105,
//             errorReason: undefined,
//             derive: [],
//           },
//           {
//             id: 6,
//             name: "开场动画片段",
//             desc: "游戏开场白动画剪辑",
//             prompt: "cinematic opening sequence, epic fantasy, dramatic music, title reveal",
//             src: "https://picsum.photos/seed/clip1/800/450",
//             state: "未生成",
//             type: "clip",
//             errorReason: undefined,
//             derive: [],
//           },
//           {
//             id: 7,
//             name: "战斗特效片段",
//             desc: "激烈战斗场面的特效剪辑",
//             prompt: "intense battle sequence, magic effects, sword clash, particle effects",
//             src: "https://picsum.photos/seed/clip2/800/450",
//             state: "生成失败",
//             type: "clip",
//             flowId: 107,
//             errorReason: "资源不足，生成队列已满",
//             derive: [
//               {
//                 id: 701,
//                 assetsId: 7,
//                 name: "战斗特效-简化版",
//                 prompt: "battle sequence, simplified effects",
//                 desc: "简化特效版本",
//                 src: "https://picsum.photos/seed/clip2_d1/800/450",
//                 state: "未生成",
//                 type: "clip",
//               },
//             ],
//           },
//         ],
//       },
//     },
//   },
//   {
//     id: "3",
//     type: "pluginNode",
//     position: { x: 1300, y: 0 },
//     data: {
//       pluginId: "toonflowPlugin:scriptPlan",
//       data: {
//         scriptPlan:
//           "这是一个<tg><del>剧本规划</del><ins>导演创作方案</ins></tg>的示例内容，包含了多个场景和角色的描述，以及他们之间的关系和互动。通过这个<tg><del>剧本规划</del><ins>导演方案</ins></tg>，创作者可以清晰地了解整个故事的<tg><del>结构和发展方向</del><ins>叙事脉络与视觉风格</ins></tg>，从而更好地进行创作和制作。\n\n场景一：勇者与魔法师的相遇\n在一个<tg><del>风雨交加的夜晚</del><ins>雷声轰鸣的深夜</ins></tg>，勇者在山顶遇到了神秘的魔法师。两人因为<tg><del>误会</del><ins>立场分歧</ins></tg>而发生冲突，但最终联手对抗共同的敌人，建立了<tg><del>深厚的友谊</del><ins>超越生死的羁绊</ins></tg>。\n\n场景二：古老森林的冒险\n勇者和魔法师进入了一片<tg><del>充满危险的</del><ins>暗藏未知威胁的</ins></tg>古老森林，他们需要克服各种<tg><del>障碍和敌人</del><ins>陷阱、幻境与追杀</ins></tg>，寻找传说中的宝藏。在这个过程中，他们也逐渐揭开了彼此的<tg><del>过去和内心的秘密</del><ins>隐藏身份与命运羁绊</ins></tg>。\n\n场景三：城堡废墟的决战\n最终，勇者和魔法师来到了一个被诅咒的城堡废墟，在这里他们将面对<tg><del>最强大的敌人</del><ins>幕后真正的黑手</ins></tg>，并决定整个世界的命运。通过这场决战，他们不仅展现了自己的<tg><del>力量</del><ins>意志与牺牲精神</ins></tg>，也证明了<tg><del>友谊和信念的重要性</del><ins>守护与信仰能够战胜一切黑暗</ins></tg>。<tg><del></del><ins>\n\n场景四：战后的余晖\n决战结束，废墟在晨光中静静沉寂，勇者将神圣之剑插入大地，两人相视而笑，镜头缓缓拉远，交代世界重归和平的结局。</ins></tg>",
//       },
//     },
//   },
//   {
//     id: "4",
//     type: "pluginNode",
//     position: { x: 1950, y: 0 },
//     data: {
//       pluginId: "toonflowPlugin:storyboardTable",
//       data: {
//         storyboardTable: `<table border="1" width="100%" cellspacing="0" cellpadding="8" style="border-collapse:collapse;width:100%;table-layout:fixed;">
//   <colgroup>
//     <col style="width:60px"/>
//     <col style="width:80px"/>
//     <col style="width:200px"/>
//     <col style="width:200px"/>
//     <col style="width:150px"/>
//     <col style="width:150px"/>
//     <col style="width:100px"/>
//     <col style="width:150px"/>
//   </colgroup>
//   <thead>
//     <tr style="background-color:#2c3e50;color:#ffffff;text-align:center;">
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">镜号</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">景别</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">画面内容</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">参考图</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">对白/旁白</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">音效/音乐</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">时长(s)</th>
//       <th style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">备注</th>
//     </tr>
//   </thead>
//   <tbody>
//     <tr style="background-color:#ecf0f1;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">001</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">远景</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">清晨，镜头从高空俯瞰整个城市，阳光洒落在楼群之间，薄雾弥漫，城市慢慢苏醒。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">——</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">晨鸟鸣叫，轻柔背景音乐</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">5</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">开场镜头，奠定基调</td>
//     </tr>
//     <tr style="background-color:#ffffff;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">002</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">全景</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">主角从公寓楼走出，背着双肩包，步伐轻快，迎着阳光走向街道。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">今天一定会有好事发生。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">轻快节奏音乐</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">4</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">主角登场</td>
//     </tr>
//     <tr style="background-color:#ecf0f1;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">003</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">中景</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">主角在街边早餐摊前停下，与摊主交谈，笑容满面，掏出手机扫码付款。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">老板，老样子！</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">街道嘈杂环境音</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">6</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">体现日常生活感</td>
//     </tr>
//     <tr style="background-color:#ffffff;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">004</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">近景</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">主角手机震动，低头看到一条陌生消息，表情从轻松转为疑惑，眉头微皱。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">这是……谁？</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">手机震动音效，悬疑音调渐入</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">4</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">埋下悬念</td>
//     </tr>
//     <tr style="background-color:#ecf0f1;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">005</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">特写</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">手机屏幕特写，显示消息内容："你知道真相吗？"，发件人显示为"未知"。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">——</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">悬疑音效拉升</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">3</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">转折点，推动剧情</td>
//     </tr>
//     <tr style="background-color:#ffffff;text-align:center;vertical-align:middle;">
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">006</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">中近景</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;text-align:left;">主角抬起头，环顾四周，人群川流不息，镜头缓慢推进至主角脸部，神情凝重。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;height:80px;min-width:150px;">[参考图]</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">（内心独白）我必须找到答案。</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">背景音乐渐强，节奏加快</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">5</td>
//       <td style="border:1px solid #bdc3c7;padding:10px;font-size:13px;">第一幕结尾</td>
//     </tr>
//   </tbody>
// </table>`,
//       },
//     },
//   },
//   {
//     id: "5",
//     type: "pluginNode",
//     position: { x: 3000, y: 0 },
//     data: {
//       pluginId: "toonflowPlugin:storyboard",
//       data: {
//         storyboard: [
//           {
//             id: 1,
//             duration: 5,
//             prompt: "勇者站在山顶俯瞰远方的城堡，风吹动斗篷，镜头缓慢推进",
//             trackId: 1001,
//             associateAssetsIds: [1, 3],
//             src: "https://picsum.photos/seed/sb1/450/800",
//             state: "已完成",
//             flowId: 5001,
//             reason: undefined,
//             videoDesc: "开场镜头，勇者眺望远方，展现宏大世界观",
//             shouldGenerateImage: 1,
//           },
//           {
//             id: 2,
//             duration: 3,
//             prompt: "魔法师在古老森林中施展紫色魔法，光芒四射，周围树木被照亮",
//             trackId: 1002,
//             associateAssetsIds: [2, 4],
//             src: "https://picsum.photos/seed/sb2/450/800",
//             state: "已完成",
//             flowId: 5002,
//             reason: undefined,
//             videoDesc: "魔法师在森林中施法的特写镜头",
//             shouldGenerateImage: 1,
//           },
//           {
//             id: 3,
//             duration: 4,
//             prompt: "城堡废墟中两人对峙，紧张气氛，乌云密布，闪电劈过天空",
//             trackId: 1003,
//             associateAssetsIds: [1, 2, 5],
//             src: null,
//             state: "生成中",
//             flowId: 5003,
//             reason: undefined,
//             videoDesc: "高潮对峙场景，勇者与魔法师在废墟相遇",
//             shouldGenerateImage: 1,
//           },
//           {
//             id: 4,
//             duration: 6,
//             prompt: "激烈的剑与魔法交锋，火花与魔法粒子碰撞，快速剪辑节奏",
//             trackId: 1004,
//             associateAssetsIds: [1, 2, 3, 7],
//             src: null,
//             state: "未生成",
//             reason: undefined,
//             videoDesc: "核心战斗场景，剑术与魔法的正面交锋",
//             shouldGenerateImage: 0,
//           },
//           {
//             id: 5,
//             duration: 8,
//             prompt: "战斗结束后，阳光穿透云层洒向大地，勇者将剑插入地面，镜头缓慢拉远",
//             trackId: 1005,
//             associateAssetsIds: [1, 3, 4],
//             src: null,
//             state: "生成失败",
//             flowId: 5005,
//             reason: "生成超时，服务端资源不足，请稍后重试",
//             videoDesc: "战斗结束的尾声，展现和平降临的氛围",
//             shouldGenerateImage: 1,
//           },
//           {
//             id: 6,
//             duration: 2,
//             prompt: "黑幕渐入，标题文字逐字浮现，背景音乐渐强",
//             associateAssetsIds: [],
//             src: null,
//             state: "未生成",
//             reason: undefined,
//             videoDesc: "片尾标题展示画面",
//             shouldGenerateImage: 0,
//           },
//         ],
//       },
//     },
//   },
// ]);

onMounted(async () => {
  await getScriptData();
  if (!episodesId.value) return;
});

const episodesOptions = ref<{ label: string; value: number }[]>([]);

const { episodesId,  status } = storeToRefs(productionAgentStore());
provide("episodesId", episodesId);

async function getScriptData() {
  //获取剧本
  const { data: scriptRes } = await axios.post("/script/getScrptApi", {
    projectId: project.value?.id,
    name: "",
  });
  episodesOptions.value = scriptRes.map((ep: any) => ({
    label: ep.name,
    value: ep.id,
  }));
  if (episodesOptions.value.length) {
    episodesId.value = episodesOptions.value[0].value;
  }
  if (status.value !== "pending" && status.value !== "streaming") {
    episodesId.value && (await productionAgentStore().getFlowData());
    await productionAgentStore().getHistory();
  }
}

function handleEpisodesChange(value: unknown) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const nextEpisodesId = Number(rawValue);
  if (!Number.isFinite(nextEpisodesId) || nextEpisodesId === episodesId.value) return;
  episodesId.value = nextEpisodesId;
  productionAgentStore().getFlowData();
}

import { useFlowBuilder } from "./useFlowBuilder";

const { nodes } = useFlowBuilder();

watch(
  nodes,
  (newNodes) => {
    console.log("%c Line:508 🥐 newNodes", "background:#fca650", newNodes);
  },
  { deep: true },
);
</script>

<style scoped>
.flowWrap {
  width: 100%;
  height: 100%;
}
</style>
