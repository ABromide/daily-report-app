# The Physics of Multi-Turn Long-Horizon Planning：长程规划能力到底从哪里来？

## 元信息与 TL;DR

- **论文**：The Physics of Multi-Turn Long-Horizon Planning: From Pre-training to Post-training via Single- and Multi-Teacher On-Policy Agentic Distillation
- **作者**：Tianyi Men, Zhuoran Jin, Kang Liu, Jun Zhao
- **链接**：[arXiv](https://arxiv.org/abs/2607.24720) / [HTML](https://arxiv.org/html/2607.24720) / [项目页](https://quester-one.github.io/PlanPhysWebsite/) / [代码](https://github.com/Quester-one/PlanPhysCode) / [数据集](https://huggingface.co/datasets/MultimodalAgent/TianyiMen_PlanPhys_Datasets) / [模型](https://huggingface.co/MultimodalAgent/TianyiMen_PlanPhys_Models)
- **发布时间**：2026-07-27 17:55:03 UTC
- **方向**：大模型后训练；更准确地说，是面向多轮 Agent 的长程规划能力如何在预训练、GRPO/OPD、MOPD 三个训练阶段中被获得、塑形和整合。

### TL;DR

- 这篇论文不是提出一个新的单点 Agent benchmark，而是搭建一个可控的多轮规划环境，追问一个训练机制问题：**长程规划能力究竟来自预训练数据、后训练优化，还是多教师能力合并**。
- 作者构造了三个合成但可控的领域：Fantasy Alchemy、Livestock Farming、Electronic Assembly；每个领域有 5 个层级、每层 40 类物品、每类 20 个实例，任务是从初始库存合成目标物品。
- 论文把长程规划拆成两类变量：**planning pattern** 是可复用的思考骨架，例如先定位目标、再递归展开依赖；**planning knowledge** 是任务绑定的具体配方或状态转移规则。
- 预训练阶段的关键结论是：显式内化 world model 比直接预测动作更能泛化。短任务上 avg@8 从 89.5% 到 98.9%，中程提升 39.3 点，长程提升 45.8 点；但直接动作预测早期更省 token、收敛更快。
- 原子技能本身不等于长程能力。只看短任务时，模型 short pass@8 可到 93.12%，但 middle 只有 0.83%、long 为 0；加入 5% middle 轨迹后 middle pass@8 跳到 51.88%，加入 5% long 轨迹后 long pass@8 到 11.46%。
- 后训练阶段的关键对比是 GRPO 与 OPD。数据质量较差、规划 horizon 较长时，OPD 的有效区域比 GRPO 更宽；在 4 Opt.:8 Sub. 设置下，long OPD 的 avg@8 S/M/L 平均为 33.78，long GRPO 只有 13.61，甚至低于 instruct 的 15.19。
- 但 OPD 不是万能知识搬运器。Teacher B 即使在自己配方上 100% 成功，若学生已内化 Recipe A，强行蒸馏 Recipe B 会让总体 pass@8 从 Student+Teacher A 的 46.74 跌到 36.60，低于 instruct 的 44.03。
- MOPD 的核心不是简单相加多个专家，而是向共享的高质量规划模式收敛。兼容共享 pattern 能跨环境泛化；部分共享且有冲突时可连续学习；完全冲突或目标环境缺少该 pattern 支持时，会遗忘或干扰。
- 论文的局限也很清楚：环境是合成的、状态转移可控、教师近似理想，不能直接推出真实 Web/OS/代码 Agent 的效果；它更像一套机制显微镜，用来解释为什么长程 Agent 后训练经常卡在 credit assignment、数据质量和教师-学生知识错配上。

## 研究问题：为什么“多轮长程规划”不能只看终态成功率？

### 论文真正关心什么？

- 作者把问题放在三个训练阶段上：
  1. **预训练阶段**：模型是不是已经从数据中获得了可组合的规划能力？
  2. **RL/OPD 后训练阶段**：稀疏奖励和教师分布分别能塑形哪些能力？
  3. **多教师整合阶段**：多个领域专家能不能合并成一个更通用的 Agent？

- 这个问题重要，是因为真实 Agent 任务有几个共同难点：
  - 一次失败可能发生在第 3 步，但到第 12 步才被 evaluator 判定失败。
  - 单步动作正确不代表整条轨迹可恢复；长程任务会放大早期偏差。
  - 同一个目标可以有多条合法路径，teacher 与 student 可能各自学到不同 procedural knowledge。
  - 大模型后训练常把“模式选择”和“知识注入”混在一起讨论，导致无法判断 GRPO、OPD、MOPD 分别该用在什么边界内。

### 作者如何让问题可控？

| 设计 | 论文中的作用 | 为什么不是普通 benchmark |
|---|---|---|
| 三个合成领域 | Fantasy Alchemy、Livestock Farming、Electronic Assembly | 控制领域差异，而不是依赖不可解释的网页或真实软件环境 |
| 分层物品图 | 5 个 level，每层 40 类物品，每类 20 个实例 | 可以精确调节短程、中程、长程任务 |
| AND/OR 组合规则 | 目标物品由多个材料、替代路径或中间物品生成 | 模拟多路径 planning knowledge |
| 正常/捷径/错误轨迹 | 控制 optimal 与 suboptimal pattern 比例 | 直接观察低质量数据如何污染长程能力 |
| 多教师顺序 OPD | 先 FA，再 LF，再 EA | 模拟基础模型公司常见的领域专家合并 |

### 这套环境的尺度

- 每个领域：
  - **5 个层级**
  - **200 个物品类别**
  - **400 条状态转移**

- 测试协议：
  - 每个测试子集 **160 个实例**
  - 3 个领域 × 3 个难度，共 **1,440 个测试实例**
  - 每个实例独立采样 8 条轨迹
  - 一个 checkpoint 最多需要 **11,520 次 inference run**
  - 指标同时报告：
    - `avg@8`：8 次采样的平均成功率
    - `pass@8`：8 次中至少一次成功的任务比例

## 论文主张与论证路线

| Claim | Mechanism | Evidence | Boundary |
|---|---|---|---|
| 长程规划需要内化 world model | CoT 中显式建模 `state + action -> next state` | w/ WM 在 short/middle/long 上比 direct answering 分别提升 9.4、39.3、45.8 个 avg@8 点 | 合成环境状态可枚举，真实世界状态更嘈杂 |
| 原子技能不会自动组合成长程能力 | 只学短任务时缺少跨步骤连接模板 | short-only 的 short pass@8 为 93.12%，middle 0.83%，long 0 | 加少量长程数据有效，但比例、分布和任务类型仍需调参 |
| 低质量轨迹会在长 horizon 中灾难性放大 | 早期 suboptimal action 让后续状态偏离目标路径 | 4 Opt.:8 Sub. 下 middle/long 接近归零 | 实验中的错误类型可控，真实 Agent 的错误更混杂 |
| OPD 比 GRPO 更适合低质量、长 horizon 的 pattern 塑形 | OPD 给 token/step 级 teacher 分布，GRPO 只从稀疏 outcome 分配信用 | 4 Opt.:8 Sub. 下 long OPD avg@8 S/M/L 平均 33.78，long GRPO 13.61 | 结论依赖理想 teacher；若 teacher 知识错配，OPD 会伤害学生 |
| planning pattern 与 planning knowledge 不能混用一种后训练解释 | pattern 低互信息、可跨样本共享；knowledge 高互信息、绑定具体任务 | Teacher B 100% 成功仍让 Student+Teacher B pass@8 低于 instruct | 互信息是解释框架，不是直接可部署的自动诊断器 |
| MOPD 整合的是共享模式，不是所有专家能力的并集 | 顺序 KL 蒸馏会向教师分布交集中的高质量模式收敛 | 共享兼容时跨环境提升；无共享冲突时出现遗忘和干扰 | 多教师同时推理、router、MoE 合并不在本文范围内 |

## 方法机制：从 world model 到 Agent-OPD

### 规划任务的基本形式

- 论文把 Agent planning 形式化为：

```text
给定：
  初始状态 s0
  目标 g
  动作集合 A = {a1, a2, ..., aT}

目标：
  生成一串可执行动作，使环境从 s0 转移到 sT
  并让 sT 满足目标 g
```

- 更具体地说，skill 被看作自然语言中的程序片段：

```text
k = (d, P)

d：任务描述，例如“制作羊毛”
P：有序子步骤，例如“种草 -> 喂羊 -> 剪羊毛”
```

- world model 不是外部数据库，而是模型在 CoT 中学到的状态转移函数：

$$
T(s_t, a_t) \rightarrow s_{t+1}
$$

- 这意味着模型要先在内部模拟“做这个动作之后会发生什么”，再输出下一步行动。

### Skill internalized world modeling

- 作者进一步把规划看作在内部状态空间上的 DFS：

$$
s_{t+1}=f_{k_{t,m_t}}\circ\cdots\circ f_{k_{t,1}}(s_t)
$$

| 符号 | 含义 | 在论文中的直觉 |
|---|---|---|
| `s_t` | 第 t 个内部状态 | 当前库存、目标、已生成中间物 |
| `k` | 原子 skill | 一条可执行的合成或转换规则 |
| `f_k` | skill 对状态的转移函数 | 使用材料生成新物品 |
| `k_t` | 当前 DFS 节点选择的 skill 序列 | 一次展开多个依赖 |
| `s_{t+1}` | 执行 skill 后的新状态 | 下一轮规划的搜索节点 |

- 这解释了为什么直接动作预测会更快却上限低：
  - 直接预测学的是“当前输入对应哪个动作”。
  - world modeling 学的是“动作如何改变状态”。
  - 长程任务需要后者，因为测试目标往往是训练中未完整出现的新组合。

### Agent-OPD 的核心目标

- 多轮轨迹写作：

$$
\tau=(g,s_0,\hat{Y}_1,s_1,\dots,\hat{Y}_K,s_K)\sim\pi_\theta
$$

- 每一轮 `k` 中，学生模型在上下文 `H_k` 下生成 token 序列：

$$
\hat{Y}_k=(\hat{y}_{k,1},\dots,\hat{y}_{k,T_k})
$$

- 学生与教师在每个 token 前缀上给出分布：

$$
p_{k,t}=\pi_\theta(\cdot\mid H_k,\hat{Y}_{k,<t}),\quad
q_{k,t}=\pi_\text{teacher}(\cdot\mid H_k,\hat{Y}_{k,<t})
$$

- Agent-OPD 最小化整条多轮轨迹上的 reverse KL：

$$
\mathcal{L}_{\text{Agent-OPD}}(\theta)
=
\mathbb{E}_{\tau\sim\pi_\theta}
\left[
\sum_{k=1}^{K}
\sum_{t=1}^{T_k}
D_{\text{KL}}(p_{k,t}\parallel q_{k,t})
\right]
$$

- 这个目标的关键不是“蒸馏”这个名字，而是：
  - 轨迹来自学生自己当前策略，因此是 on-policy。
  - teacher 在学生已经访问的状态上给监督。
  - 监督粒度比最终 reward 更细，可以覆盖中间 reasoning token 与 action token。

### 为什么作者要区分 pattern 和 knowledge？

- 论文用互信息解释两类能力：

$$
I(T;P)=H(P)-H(P|T),\quad I(T;K)=H(K)-H(K|T)
$$

| 变量 | 含义 | 互信息判断 | 训练含义 |
|---|---|---|---|
| `T` | 输入任务 | 给定任务后约束输出 | 任务越具体，约束越强 |
| `P` | planning pattern | `I(T;P)` 较低 | pattern 可跨任务共享，适合 RL/OPD 塑形 |
| `K` | planning knowledge | `I(T;K)` 较高 | knowledge 绑定具体样本，更适合 SFT 或高质量数据 |

- 这个区分是全文的枢纽：
  - GRPO 和 OPD 能较好地强化“选择哪种思考骨架”。
  - 但它们不擅长凭小幅参数更新注入大量、逐样本不同的配方知识。
  - 如果 teacher 与 student 的配方体系不同，KL 会把学生原有合法路径压低。

## 算法流程：这篇论文如何训练与评测？

### 预训练阶段

```text
Input:
  三个合成领域 D = {FA, LF, EA}
  每个领域的物品层级、AND/OR 配方图、实例名
  训练样本比例：short / middle / long
  轨迹质量：optimal / suboptimal

State:
  学生模型参数 theta
  CoT 格式：direct answering 或 world-model planning

Loop:
  1. 从配方图采样目标物品和初始库存
  2. 构造 gold plan 或混入 suboptimal plan
  3. 用对应格式生成训练文本
  4. 训练学生模型
  5. 在 short / middle / long 测试集上采样 8 条轨迹

Output:
  avg@8、pass@8
  不同数据格式、分布、质量下的能力边界

Failure boundary:
  只学 atomic skill 时，模型可能记住单步转换
  但无法把它们递归组合成未见过的长轨迹
```

### OPD/GRPO 后训练阶段

```text
Input:
  学生策略 pi_theta
  教师策略 pi_teacher
  当前任务目标 g 与初始状态 s0
  多轮环境反馈 s1...sK

Loop:
  1. 学生 rollout 生成多轮轨迹 tau
  2. 若使用 GRPO：
       用终态成功/失败形成 group-relative advantage
       回传到整条轨迹
  3. 若使用 OPD：
       在学生访问过的每个前缀上查询 teacher 分布
       最小化 token-level / turn-level KL
  4. 更新 theta
  5. 记录不同 horizon 与 suboptimal ratio 下的性能和梯度方向

Output:
  三个 RL 适用区域
  GRPO 与 OPD 的有效边界
  SVD top-k update-direction similarity

Failure boundary:
  如果 teacher 的 procedural knowledge 与 student 内部 world model 不一致
  OPD 会把合法但不同的学生路径压低，导致 knowledge collapse
```

### MOPD 整合阶段

```text
Input:
  学生模型 theta
  教师序列 {Teacher_FA, Teacher_LF, Teacher_EA}
  教师间 pattern 关系：共享兼容 / 部分共享冲突 / 无共享冲突

State:
  当前学生分布
  已学领域能力
  各领域 pattern support

Loop:
  for teacher_m in [FA, LF, EA]:
      1. 学生在当前环境 rollout
      2. teacher_m 在同一前缀上给分布 q_m
      3. 最小化 Agent-OPD KL
      4. 在所有领域评测，而不只评测当前教师领域

Output:
  跨环境泛化、连续学习或灾难性遗忘

Failure boundary:
  MOPD 只能强化学生分布中已有或兼容的 pattern
  不能凭空创造目标环境预训练中缺失的 pattern
```

## 实验设置：哪些变量被精确控制？

### 难度与数据划分

| 难度 | 步数范围 | 论文想测什么 |
|---|---:|---|
| Short | 1-5 步 | 单步或短链条技能是否掌握 |
| Middle | 6-8 步 | 原子技能能否开始组合 |
| Long | 9 步以上 | 早期错误是否会级联放大 |

- 数据划分方式：
  - 前 20 个具体实例作为测试池。
  - 编号 20 到 219 的实例作为后训练池。
  - 剩余实例作为预训练池。

- 这个划分有两个好处：
  - 测试实例名不直接泄漏到训练中。
  - recipe schema、领域和层级可控，便于改变 horizon 与数据质量。

### 训练语料变量

| 变量 | 取值 | 用来回答的问题 |
|---|---|---|
| 数据格式 | direct answering / world modeling | 能力来自答案记忆还是状态转移建模 |
| 数据分布 | short / middle / long 的 0%、5%、50%、100% | 少量长程轨迹能否触发组合能力 |
| 数据质量 | 1 Opt., 4 Opt., 4 Opt.:4 Sub., 4 Opt.:8 Sub. | 多样 optimal pattern 与 suboptimal pattern 的差异 |
| 教师配方 | Recipe A / Recipe B | teacher 高准确率是否足以迁移知识 |
| 教师关系 | shared compatible / shared conflict / no shared conflict | MOPD 是否泛化、连续学习或遗忘 |

## 主结果一：world model 比直接动作预测更能泛化

### Figure 3 / Figure 4 支撑什么？

- Figure 3 比较了有无 world modeling 的最终性能。
- Figure 4 比较了训练步数增加时的 scaling 曲线。

| 设置 | 直接回答 | world modeling | 变化 |
|---|---:|---:|---:|
| Short avg@8 | 89.5% | 98.9% | +9.4 点 |
| Short pass@8 | 92.1% | 99.0% | +6.9 点 |
| Middle avg@8 | 未逐项展开 | 更高 | +39.3 点 |
| Middle pass@8 | 未逐项展开 | 更高 | +32.9 点 |
| Long avg@8 | 未逐项展开 | 更高 | +45.8 点 |
| Long pass@8 | 未逐项展开 | 更高 | +42.9 点 |

- 这组证据的含义：
  - 直接回答像是在学 `input -> action` 的映射。
  - world modeling 像是在学 `state -> action -> state` 的规则。
  - 当测试任务只是短链条时，两者差距较小。
  - 当测试任务需要 6 步、9 步以上时，直接回答缺少中间状态模拟，泛化上限被压住。

### 不能从这里推出什么？

- 不能推出所有真实 Agent 都应该输出很长 CoT。
- 论文证明的是：在可控合成环境中，显式状态转移建模提高了长程泛化。
- 对真实部署而言，更合理的延伸是：
  - 是否需要一个可验证的状态表示？
  - 是否需要把 action 前后的环境差异写进训练轨迹？
  - 是否需要让模型学会“预测动作后果”，而不只是模仿下一步动作？

## 主结果二：原子技能不会自动组成长程能力

### Table 1 / Figure 5 的关键数字

| 训练暴露 | Short pass@8 | Middle pass@8 | Long pass@8 | 解释 |
|---|---:|---:|---:|---|
| 只看 short | 93.12% | 0.83% | 0.00% | 原子技能强，但组合失败 |
| 加 5% middle | 未完整列出 | 51.88% | 未完整列出 | 中程轨迹触发组合模板 |
| 加 5% long | 未完整列出 | 未完整列出 | 11.46% | 长程轨迹开始教会跨层连接 |

- 作者的判断可以拆成两层：
  - **技能层**：模型知道一个 item 可以由哪些材料合成。
  - **规划层**：模型知道先合成哪个中间 item、什么时候回溯、如何连接多段技能。

- 只学短任务时，技能层可以很好，但规划层缺少长链条样本。
- 加入少量长程轨迹后，模型不只是多记了几个例子，而是看到了“如何把短技能接成长序列”的格式。

### 对后训练研究的含义

- 如果预训练或 SFT 中没有任何长程结构，RL 很可能不是最省成本的补救。
- 更合理的训练配方是：
  1. 先用少量高质量长程轨迹建立连接模板。
  2. 再用 RL/OPD 强化高回报 pattern。
  3. 最后用评测定位哪些具体 knowledge 仍缺失。

## 主结果三：低质量轨迹会在长 horizon 中放大

### Figure 6 的证据角色

- 作者比较 1 Opt.、4 Opt.、4 Opt.:4 Sub.、4 Opt.:8 Sub.。
- 结论不是“多样性有害”，而是：
  - 多个 optimal reasoning templates 本身不会显著伤害泛化。
  - 真正危险的是 suboptimal action 混入长期轨迹。

### 为什么长程任务更脆弱？

```mermaid
flowchart LR
  A["早期状态 s0"] --> B["选择一个 suboptimal action"]
  B --> C["进入偏离目标的 s1"]
  C --> D["后续依赖关系不再匹配"]
  D --> E["模型继续在错误状态上规划"]
  E --> F["超过步数限制或生成无效动作"]
```

- 短任务里，一个偏差可能还有机会靠采样或后续动作补回来。
- 长任务里，错误状态会成为后续每一步的输入。
- 因此，suboptimal trajectory 不是局部噪声，而是会改变整棵搜索树。

## 主结果四：OPD 的有效区域比 GRPO 更宽，但前提是 teacher 对齐

### 三个 RL 适用区域

| 区域 | 条件 | 训练判断 |
|---|---|---|
| Region A：unnecessary | 不同 pattern 表现接近 | RL 选择没有必要，SFT 已足够 |
| Region B：effective | pattern 间回报差异清楚 | GRPO/OPD 都可能找到更好 pattern |
| Region C：unsupported | 好 pattern 存在，但稀疏奖励难发现 | 需要更细粒度信用分配，OPD 更稳 |

### Table 3 的关键对比

| Pattern mix | 模型 | avg@8 S/M/L mean | 相对 instruct | 解读 |
|---|---|---:|---:|---|
| 4 Opt.:4 Sub. | Instruct | 26.13 | +0.00 | 中低质量数据，仍有可优化空间 |
| 4 Opt.:4 Sub. | Long OPD | 41.25 | +15.12 | OPD 能稳定塑形 pattern |
| 4 Opt.:4 Sub. | Long GRPO | 38.47 | +12.34 | GRPO 也有效，但略弱 |
| 4 Opt.:8 Sub. | Instruct | 15.19 | +0.00 | suboptimal 比例更高 |
| 4 Opt.:8 Sub. | Long OPD | 33.78 | +18.59 | OPD 仍能拉起一部分能力 |
| 4 Opt.:8 Sub. | Long GRPO | 13.61 | -1.58 | GRPO 在该区间失效 |

- 这里的核心机制：
  - GRPO 从 episode outcome 反推整条轨迹的信用。
  - 长轨迹中正确步骤和错误步骤混在一起，终态 reward 很难告诉模型哪一步错了。
  - OPD 在学生访问过的每个前缀上给 teacher 分布，因此更新方向更密集、更一致。

### Figure 9 / Figure 10 的梯度方向证据

- 作者用 SVD 比较不同 checkpoint 的参数更新方向。
- 对每层权重变化：

$$
\Delta W_\ell^{(t)}=W_\ell^{(t)}-W_\ell^{(b)}
$$

- 做奇异值分解：

$$
\Delta W_\ell^{(t)}=U_\ell^{(t)}\Sigma_\ell^{(t)}(V_\ell^{(t)})^\top
$$

- 取 top-5 左奇异向量，与最终 checkpoint 比较方向相似度：

$$
S^{(k)}(t,f)=
\frac{1}{|\mathcal{L}|}
\sum_{\ell\in\mathcal{L}}
\frac{1}{k}
\sum_{i=1}^{k}
\left|
\frac{(u_{\ell,i}^{(t)})^\top u_{\ell,i}^{(f)}}
{\|u_{\ell,i}^{(t)}\|_2\|u_{\ell,i}^{(f)}\|_2}
\right|
$$

- 结果含义：
  - 长 horizon 和更多 non-optimal actions 会让 GRPO 的方向更噪。
  - 某些 GRPO 曲线初期贴近 0，说明梯度几乎没有有效更新。
  - OPD 在多个设置中保持更高的方向一致性。

## 主结果五：teacher 高准确率不等于知识可迁移

### Recipe A / Recipe B 实验为什么重要？

- 作者构造了两套都合法的程序知识：
  - Recipe A：例如用 water、grass seed、lamb 生成 wool。
  - Recipe B：例如用 water、cotton seed、spinning 生成同一目标。

- Teacher A 和 Teacher B 在自己的路径上都可以做到 100%。
- 学生预训练内化的是 Recipe A。
- 问题是：能否用 Teacher B 通过 OPD 把 Recipe B 注入学生？

### Table 4 的关键数字

| 模型 | avg@8 S/M/L mean | pass@8 S/M/L mean | 说明 |
|---|---:|---:|---|
| Instruct | 26.13 | 44.03 | 4 Opt.:4 Sub. 基线 |
| Student + Teacher A | 41.37 | 46.74 | teacher 与学生 procedural knowledge 对齐 |
| Student + Teacher B | 31.50 | 36.60 | teacher 高分但知识路径错配 |
| B - A | -9.87 | -10.14 | 错配造成整体退化 |

- 更具体的损伤：
  - Middle FA 上，Student+Teacher B 比 Student+Teacher A 的 avg@8 低 36.09 点。
  - Middle FA 上，pass@8 低 43.75 点。

### 为什么会这样？

- OPD 的 KL 目标会告诉学生：
  - teacher 在这个前缀下认为哪些 token 更可能。
  - 学生应该降低与 teacher 分布的差异。

- 但当 student 的内部 world model 是 Recipe A、teacher 是 Recipe B 时：
  - student 的合法路径在 teacher 分布下可能显得“不像正确答案”。
  - KL 会压低 student 原有的合法程序知识。
  - 小幅 RL/OPD 更新又不足以完整建立 Recipe B。
  - 最终模型处在中间状态：旧知识被破坏，新知识没学牢。

- 这解释了很多真实后训练现象：
  - 不是 teacher 越强越好。
  - teacher 与 student 的知识底座不对齐时，蒸馏可能先伤害已有能力。
  - 对高互信息、逐样本绑定的程序知识，SFT 数据覆盖和错误恢复样本可能比纯 RL 更关键。

## 主结果六：MOPD 是共享模式收敛，不是专家并集

### MOPD 目标

- 第 `m` 个教师的顺序蒸馏目标：

$$
\mathcal{L}_{\text{Agent-OPD}}^{(m)}(\theta)
=
\mathbb{E}_{\tau\sim\pi_\theta}
\left[
\sum_{k=1}^{K}
\sum_{t=1}^{T_k}
D_{\text{KL}}(p_{k,t}\parallel q_{k,t}^{(m)})
\right]
$$

- 训练顺序是：

```text
Student -> OPD with Teacher_FA -> OPD with Teacher_LF -> OPD with Teacher_EA
```

### 三类教师关系

| 类型 | pattern 关系 | 结果 |
|---|---|---|
| Type I | 共享且兼容 | 能跨环境泛化 |
| Type II | 部分共享但有冲突 | 可连续学习，但依赖共享结构 |
| Type III | 无共享且冲突 | 容易遗忘和跨环境干扰 |

### Table 6 的共享兼容证据

- 单个 teacher 只在自己领域 100%，在其他领域为 0。
- 但学生从 FA teacher 蒸馏后，LF/EA 也能提升。

| 设置 | 指标 | Instruct | After FA | After LF | After EA |
|---|---|---:|---:|---:|---:|
| 4 Opt.:4 Sub.(a) | avg@8 S/M/L mean | 42.77 | 56.50 | 57.93 | 53.64 |
| 4 Opt.:4 Sub.(b) | avg@8 S/M/L mean | 26.61 | 42.91 | 42.64 | 39.24 |
| 4 Opt.:8 Sub. | avg@8 S/M/L mean | 14.95 | 33.85 | 33.41 | 31.00 |

- 关键不是 teacher 覆盖全部领域。
- 关键是不同领域存在共享且兼容的 planning pattern。
- MOPD 会把学生推向这些共享模式，因此某个领域 teacher 的训练信号能在其他领域表现出来。

### Table 7 的冲突证据

| 设置 | 指标 | Instruct | After FA | After LF | After EA | 解读 |
|---|---|---:|---:|---:|---:|---|
| 4 Opt.:4 Sub.(c) | avg@8 S/M/L mean | 17.86 | 36.00 | 44.99 | 63.64 | 有共享结构，顺序学习后持续改善 |
| 4 Opt.:4 Sub.(d) | avg@8 S/M/L mean | 16.28 | 35.08 | 41.19 | 39.28 | 缺少关键 normal template，EA 阶段引发干扰 |
| 4 Opt.:4 Sub.(c) | pass@8 S/M/L mean | 26.81 | 44.31 | 49.51 | 68.96 | 能避开领域陷阱并收敛到共享 T1 Goal pattern |
| 4 Opt.:4 Sub.(d) | pass@8 S/M/L mean | 22.15 | 46.32 | 46.32 | 44.44 | 后续教师不能稳定保留早期能力 |

- Form c 与 Form d 的差异说明：
  - 只要仍有共享可用 pattern，MOPD 可以像连续学习一样工作。
  - 如果目标环境缺少某个 normal pattern 的预训练支持，MOPD 无法凭 teacher 信号凭空创建它。
  - 顺序蒸馏不是能力合集；它更像在当前学生分布支撑内寻找交集模式。

## Figure / Table 逐项证据解读

| 证据 | 支撑的主张 | 不能证明什么 |
|---|---|---|
| Figure 3 | world modeling 最终准确率高于 direct answering | 不能证明显式 CoT 在所有真实任务中都优于隐式表示 |
| Figure 4 | direct answering 早期更快，world modeling 后期上限更高 | 不能回答部署时 token 成本是否可接受 |
| Figure 5 / Table 1 | 少量长程轨迹能触发组合泛化 | 不能确定真实数据中“5%”这个比例仍有效 |
| Figure 6 | suboptimal trajectory 对长程任务伤害更大 | 真实失败类型更复杂，未覆盖工具异常、权限失败、网页漂移 |
| Figure 7 / Table 3 | OPD 在低质量长 horizon 下比 GRPO 更稳 | 依赖理想 teacher，teacher 错误或偏置会改变结论 |
| Figure 9 / Figure 10 | OPD 的参数更新方向更一致 | SVD 方向相似度是诊断指标，不直接等于泛化能力 |
| Figure 11 / Table 4 | procedural knowledge 错配会让 OPD 退化 | 只验证两套配方，不覆盖多知识体系混合 |
| Table 6 | 共享兼容 pattern 支持跨环境泛化 | 不等于所有领域专家都能无损合并 |
| Table 7 / Figure 20 / Figure 21 | 部分共享支持连续学习，无共享冲突导致遗忘 | 没有比较并行 teacher mixture、router 或参数合并方法 |

## 相关工作与位置判断

### 与长程 Agent RL 的关系

- 近期许多工作把长程 Agent 失败归因于：
  - sparse reward
  - credit assignment
  - tool-use error propagation
  - trajectory-level outcome 与 token-level learning 的错位

- 这篇论文的增量在于：
  - 它不只说“长程任务难”。
  - 它把难点拆成 pre-training data format、data distribution、data quality、post-training algorithm、teacher-student knowledge alignment、multi-teacher pattern relation。
  - 因此它更像一个机制实验，而不是单纯刷 benchmark。

### 与 OPD/MOPD 技术路线的关系

- 单教师 OPD 常被理解为“用更强 teacher 监督 student 的 on-policy 轨迹”。
- 本文补充了两个边界：
  - OPD 更适合低互信息、可共享的 planning pattern。
  - OPD 不适合直接替换高互信息、样本绑定的 procedural knowledge。

- 多教师 OPD 常被理解为“整合多个专家”。
- 本文给出的更精确说法是：
  - 兼容共享 pattern：能整合。
  - 部分共享 pattern：能持续学习，但要看共享结构是否足够。
  - 无共享冲突：会遗忘或相互干扰。

### 与真实 Agent 训练的距离

- 本文环境是合成的，这是优点也是限制。
- 优点：
  - 可以精确知道模型是否见过某类 pattern。
  - 可以独立改变 horizon、质量、配方、teacher 关系。
  - 可以解释机制，而不是只看大模型黑箱结果。

- 限制：
  - 没有真实网页、文件系统、权限、工具错误、网络延迟。
  - 没有长上下文污染、跨 session 记忆、外部观察不确定性。
  - 教师设置更接近理想教师，而真实 teacher 也会幻觉、偏置或工具失败。

## 证据边界、局限与可复现性

### 已经较强的部分

- 论文提供了项目页、代码、模型和 Hugging Face 数据集链接。
- 评测协议给出具体采样次数、实例数、难度划分。
- 实验变量控制清楚，能把“数据格式”“数据分布”“数据质量”“算法目标”“教师关系”分开看。
- 论文没有只依赖最终成功率，还加入：
  - KL 动态
  - token probability heatmap
  - 参数更新方向 SVD
  - MOPD 参数空间 PCA / L2 / cosine 分析

### 仍需谨慎的部分

- 合成配方图和真实任务之间存在 domain gap。
- world model 的形式是自然语言 CoT，真实系统可能用结构化状态、工具日志或程序化 planner 替代。
- OPD 的优势依赖 teacher 分布质量；如果 teacher 在长程任务中也不稳定，细粒度监督会传播错误。
- MOPD 的顺序设定没有覆盖并行 teacher ensemble、teacher routing、LoRA merge、MoE expert routing 等常见工程方案。
- pass@8 在长程任务中可能高估上限，因为多次采样也许只是撞上预训练中已有的正确 pattern，而不代表模型真的形成稳定能力。

## 领域延伸思考

### 对后训练的直接启发

- 训练长程 Agent 时，应该先问三个问题：
  1. 预训练/SFT 数据中是否有足够高质量的长程轨迹？
  2. 当前要优化的是共享 planning pattern，还是具体 procedural knowledge？
  3. teacher 与 student 的内部知识路径是否对齐？

- 如果答案是“缺少长程结构”，优先补高质量轨迹，而不是直接上稀疏 RL。
- 如果答案是“pattern 可共享”，OPD/MOPD 可能比 GRPO 更稳。
- 如果答案是“知识高度任务绑定”，SFT、检索式技能库、错误恢复数据可能比 KL 蒸馏更关键。

### 对 Agent 安全和可靠性的间接启发

- 论文虽然不是安全论文，但它解释了一个安全相关问题：
  - 长程 Agent 的失败不是单步分类错误，而是状态偏移后的连锁错误。
  - 如果训练数据里混入 suboptimal trajectories，模型可能学会看似合理但不可恢复的行动骨架。
  - 如果多教师之间的安全策略 pattern 冲突，MOPD 可能不是简单提升安全性，而可能造成权限、恢复、拒答边界的遗忘。

- 因此，安全后训练也需要区分：
  - **通用安全 pattern**：例如先识别机密源、再决定是否调用工具。
  - **具体策略 knowledge**：例如某个系统的权限字段、某类工具的参数白名单。

### 还值得继续追问什么？

- 能否把论文中的 pattern / knowledge 诊断变成训练前的自动数据审计？
- 能否在真实 Web/OS Agent 中构造类似 controllable planning gym 的可复现实验？
- OPD 是否需要“teacher-student procedural overlap”指标，先判断是否适合蒸馏？
- MOPD 能否配合 router，让冲突 pattern 不被强行压到一个参数分布里？
- 错误恢复数据应该怎样采样：从 gold path 的人工扰动、真实失败轨迹，还是对抗性环境变化？
- 对多轮安全 Agent 来说，能否把 taint state、permission state、tool result state 也纳入 world model，而不是只训练最终拒答或执行？

## 结论

- 这篇论文最有价值的地方，是把“长程规划能力”从一个模糊能力词，拆成可控训练变量。
- 它给出的核心判断可以压缩成四句话：
  1. **预训练要给模型可内化的状态转移模型，而不只是动作答案。**
  2. **少量长程轨迹对组合泛化很关键，低质量轨迹在长 horizon 中会被放大。**
  3. **OPD 更适合塑形共享 planning pattern，但不擅长把错配的 procedural knowledge 硬塞进学生。**
  4. **MOPD 的有效性取决于教师之间和学生底座中是否存在共享、兼容的 pattern support。**

- 对研究者而言，这篇文章的意义不是“OPD 赢了 GRPO”，而是给出更细的判断边界：
  - 什么时候 RL 是多余的。
  - 什么时候 OPD 的细粒度监督能救长程 credit assignment。
  - 什么时候 teacher 再强也会因为知识错配而伤害学生。
  - 什么时候多教师整合会泛化，什么时候只是把冲突压进同一个模型。
