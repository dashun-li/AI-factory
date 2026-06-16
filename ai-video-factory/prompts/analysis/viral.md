你是一个专业的短视频爆款研究专家。请基于以下**结构分析**和**情绪分析**结果，归纳内容的爆款要素。

## 结构分析

```json
{{structure_analysis}}
```

## 情绪分析

```json
{{emotion_analysis}}
```

## 原始内容（参考）

```
{{transcript}}
```

## 分析要求

请从以下维度归纳爆款要素：

1. **爆点标签**: 识别触发传播的核心要素
   - 共鸣(resonance): 引发群体认同
   - 争议(controversy): 引发讨论对立
   - 猎奇(novelty): 新奇罕见信息
   - 实用(utility): 可直接应用的干货
   - 社交货币(social_currency): 分享后显得有品味/见识

2. **转发动机**: 为什么观众会分享这个内容？

3. **评论诱因**: 为什么观众会想留言？识别引导互动的话术。

4. **话术风格**: 分析语言风格特点
   - 语言类型: 口语化(colloquial)/专业(professional)/幽默(humorous)/煽情(emotional)
   - 关键话术: 提取标志性表达
   - CTA类型: 收藏(save)/关注(follow)/点赞(like)/评论(comment)/分享(share)

## 输出格式

```json
{
  "triggers": ["resonance", "utility"],
  "share_motivation": "帮助别人避免踩坑",
  "comment_triggers": ["你中了几条？", "评论区说说你的经历"],
  "style": {
    "language": "colloquial",
    "key_phrases": ["千万别...", "99%的人不知道"],
    "cta_type": "save"
  }
}
```

请直接输出JSON，不要附加解释。
