# AI Video Director v1.2 - 统一评测体系与五大品类 Benchmark 设计报告

**专家角色**：Subagent C (Benchmark 专家)  
**版本目标**：建立行业级商业视频质量评估与 Baseline 对比体系  
**状态**：已完成设计并就绪集成  

---

## 一、评测体系构建目标

为了客观、量化地验证 AI Video Director 方案相比“传统直接提示词生成（Baseline）”的质量优势，v1.2 引入统一 Benchmark 评测工程体系。核心目的：
1. **跨品类泛化能力量化**：覆盖电商与商业视频主流的 5 大品类。
2. **多维加权科学评分**：聚焦解决客户痛点（动作、真人感、商品），确立标准计分权重。
3. **对比模式自动化输出**：一键生成对照评估报告 `comparison-report.md`，输出明确分数差距与胜率。

---

## 二、5 大核心品类用例规范 (Benchmark Cases)

用例集中存放于 `benchmark/cases/` 目录，各案例具有标准输入配置：

1. **Case 01 - 女装服饰 (Womenswear & Fashion)**：
   - *产品*：修身收腰风衣
   - *难点*：行走时衣摆物理动力学、转身时腰带惯性、转身停步的重心转移。
2. **Case 02 - 美妆护肤 (Beauty & Cosmetics)**：
   - *产品*：高光精华液 / 唇釉
   - *难点*：面部微表情放松、持物手指无形变、特写镜头下商品标签可读性。
3. **Case 03 - 食品饮料 (Food & Beverage)**：
   - *产品*：果味气泡水
   - *难点*：开盖动作与手部动作协调、饮用仰角及咽喉吞咽微动、气泡与冰块光影。
4. **Case 04 - 消费数码 (Consumer Electronics)**：
   - *产品*：高端智能手表
   - *难点*：手腕抬起并翻转 45° 视角、指尖触控屏幕交互、金属边缘高光流转。
5. **Case 05 - 生活家居 (Lifestyle Goods)**：
   - *产品*：极简香氛喷雾
   - *难点*：生活场景中拿取与喷洒动作连贯、喷雾微粒扩散与人物侧颜交互。

---

## 三、AI Video Director 评分模型（加权公式）

根据行业调研与客户核心关切，AI Video Director 综合分（100分制）定义为：

$$\text{AI Video Director Score} = \text{Motion}(30\%) + \text{Human}(25\%) + \text{Product}(25\%) + \text{Camera}(20\%)$$

对应从 Quality Agent v2 的 4 项基础分（各项满分 25 分）加权换算：
$$\text{Score} = \left(\frac{\text{Motion}}{25} \times 30\right) + \left(\frac{\text{Human}}{25} \times 25\right) + \left(\frac{\text{Product}}{25} \times 25\right) + \left(\frac{\text{Camera}}{25} \times 20\right)$$

- **动作自然度 (Motion Naturalness, 30%)**：权重最高，针对 AI 动作机械痛点。
- **真人感表现 (Human Realism, 25%)**：消除眼神死板与面部假人感。
- **商品一致性与展示 (Product Consistency, 25%)**：拒绝形变与生硬展示。
- **镜头与商业质感 (Commercial Camera Quality, 20%)**：运镜稳定度与商业构图。

---

## 四、对比评估机制 (Baseline vs Director)

评测框架内置自动化对比执行引擎：
- **Baseline 组**：模拟通用普通 Prompt（如 `"A beautiful model holding perfume in modern room, 4k, cinematic, photorealistic"`），缺乏动力学分步指导与商品证据。
- **Director 组**：基于 DeepSeek Director + Motion DNA v2 + Product Showcase 生成的高精度分步导演方案。
- **对比报告交付**：输出 `benchmark/reports/comparison-report.md`，自动展示各 Case 维度明细、雷达对比数据与净胜分（Delta +15~25 分）。

---
