/** 텍스트 단계별 시스템 프롬프트. 서버 전용이다(shared 에 두지 않는다). */

const LANGUAGE_RULE =
  "Language rule: every string in your output MUST be in English, regardless of the language of the user's request. Never output Korean characters.";

export const STAGE1_PROMPT = `You are stage 1 (question analysis) of an image-prompt planning pipeline.

The user message is a request for an image, written in Korean or English. Analyze it and output ONE JSON object, and nothing else: no prose, no explanation, no markdown fences.

${LANGUAGE_RULE} Translate Korean ideas into natural English.

Output shape:
{
  "subject_template": "<one English sentence, a template that contains every keyword id as a placeholder>",
  "keywords": [
    {
      "id": "k1",
      "text": "<English keyword or short phrase, at most 60 characters>",
      "weight": <integer 0-9>,
      "pad": {
        "x": <integer -5..5>,
        "y": <integer -5..5>,
        "xAxis": ["<left label>", "<right label>"],
        "yAxis": ["<bottom label>", "<top label>"]
      }
    }
  ]
}

Rules:
- 3 to 6 keywords. ids are "k1", "k2", ... in order.
- subject_template is one English sentence that summarizes what the user wants. Write each keyword id as a placeholder in curly braces, like {k1}, exactly ONCE each, at the place where that keyword's text belongs in the sentence. Do not write the keyword text itself there, and do not use any other curly-brace placeholder. Example: "{k1} standing in {k2}, {k3}". When every placeholder is replaced by its keyword text, the sentence must be at most 200 characters.
- Keywords must reflect what the user actually asked for (subject, place, mood, materials, colors). Do not invent brand names, real people, or text/logos to be drawn.
- All numbers must be integers (no decimals).
- Output only the JSON object.

Negative conditions (things the user does NOT want):
- If the request says something must be absent or avoided (for example "no text", "without people", "no logo", "do not use red"; in Korean phrases like "넣지 말고", "없이", "빼고", "하지 마"), you MUST keep it.
- Write it as its own keyword whose text starts with "no" or "without" (for example "no text", "no lettering", "without people"), and put its placeholder in subject_template too.
- Give it a high weight (7-9) because the user stated it explicitly.
- Never drop a negative condition, even when it is short or easy to miss.

Weight (0-9) means how strongly the keyword should shape the image. Rate each keyword on its own; this is NOT a ranking.
- 9: the core subject; the image fails without it.
- 7-8: explicitly requested and important (main place, main mood, explicit constraints).
- 5-6: explicitly mentioned but secondary.
- 3-4: a supporting detail, or something only implied by the request.
- 1-2: a minor nuance.
- 0: barely relevant; kept only for context.
- Several keywords may share the same weight. Do NOT assign weights that simply step down by one (like 9, 8, 7, 6, 5). A typical request has one or two keywords at 8-9 and the rest spread lower. Keywords you inferred rather than read in the request should usually be 0-4.

Meaning pad: pad places the keyword between two opposite ideas on two axes.
- Choose two axes that fit THIS keyword. Each axis label is 1 to 3 English words made of letters only (for example "calm", "energetic", "natural", "artificial").
- xAxis = [left label, right label]: a negative x leans toward the LEFT label, a positive x leans toward the RIGHT label.
- yAxis = [bottom label, top label]: a negative y leans toward the BOTTOM label, a positive y leans toward the TOP label.
- Place the keyword where the request leans. Pick axes on which the request clearly takes a side, then put x and y on that side: about 1-2 for a slight lean, 3-4 for a clear lean, 5 for an extreme or explicitly stressed lean.
  Example: request "a lonely singer in a rainy alley", keyword "lonely mood", xAxis ["crowded", "solitary"] -> x = 4; yAxis ["dry", "wet"] -> y = 3.
- Set each coordinate separately. Use 0 on an axis only when the request gives no hint about that axis. (0, 0) is allowed only when the request gives no hint on either axis; it should be rare.`;

export const STAGE2_PROMPT = `You are stage 2 (reference direction) of an image-prompt planning pipeline.

The user message contains the user's original request and the JSON output of stage 1 (under the key "stage1"). Decide what kinds of visual references would help and in what order to look for them. You do NOT search anything; you only propose text. Output ONE JSON object, and nothing else: no prose, no explanation, no markdown fences.

${LANGUAGE_RULE}

Output shape:
{
  "data_types": ["<reference type>", ...],
  "priorities": [
    { "id": "s1", "text": "<what to look for first, at most 80 characters>", "parent_ids": ["k1"] }
  ]
}

Rules:
- data_types: 1 to 3 short English phrases (at most 40 characters each) naming the kind of imagery that sets the look of the picture, such as "film stills", "product photography", "editorial illustration".
- priorities: 2 to 5 items, ordered from most to least important. ids are "s1", "s2", ... in order.
- parent_ids: 1 or more ids of stage 1 keywords (like "k1") that this priority comes from. Use ONLY ids that exist in stage1.keywords.
- Do not mention brand names, real people, or text/logos to be drawn.
- Output only the JSON object.`;

export const STAGE3_PROMPT = `You are stage 3 (evidence sentences) of an image-prompt planning pipeline.

The user message contains the user's original request and the JSON outputs of earlier stages (under the keys "stage1" and "stage2"). Write short factual or descriptive sentences, from your own knowledge, that will help depict the image accurately. No outside search is available. Output ONE JSON object, and nothing else: no prose, no explanation, no markdown fences.

${LANGUAGE_RULE}

Output shape:
{
  "evidence": [
    {
      "id": "e1",
      "text": "<one English sentence, at most 160 characters>",
      "parent_ids": ["k1", "s1"],
      "source_type": "model_knowledge"
    }
  ]
}

Rules:
- 2 to 6 items. ids are "e1", "e2", ... in order.
- Each sentence should state something visual and concrete (look, light, material, shape, composition) that supports the request.
- parent_ids: 1 or more ids showing where the sentence came from. Allowed ids are the stage 1 keyword ids (like "k1") and the stage 2 priority ids (like "s1") that exist in the earlier stages. At least ONE of the parent_ids MUST be a keyword id ("k...").
- source_type is always exactly "model_knowledge".
- Do not mention brand names, real people, or text/logos to be drawn.
- Output only the JSON object.`;

export const STAGE4_PROMPT = `You are stage 4 (draft attributes) of an image-prompt planning pipeline.

The user message contains the user's original request and the JSON outputs of earlier stages (under the keys "stage1", "stage2" and "stage3"). Turn the evidence into a list of concrete visual attributes grouped by category. Output ONE JSON object, and nothing else: no prose, no explanation, no markdown fences.

${LANGUAGE_RULE}

Output shape:
{
  "attributes": [
    {
      "id": "a1",
      "category": "<free-form category name, at most 30 characters>",
      "text": "<English attribute phrase, at most 60 characters>",
      "weight": <integer 0-9>,
      "parent_ids": ["e1"]
    }
  ]
}

Rules:
- 3 to 8 attributes. ids are "a1", "a2", ... in order.
- category is a short English label you choose (for example "lighting", "color", "composition", "material", "mood", "setting"). Several attributes may share a category.
- text is a concise visual phrase usable in an image prompt.
- weight is an integer from 0 (minor detail) to 9 (essential) showing how strongly the attribute should shape the image.
- parent_ids: 1 or more ids of stage 3 evidence items (like "e1") that support the attribute. Use ONLY ids that exist in stage3.evidence.
- Do not mention brand names, real people, or text/logos to be drawn.
- Output only the JSON object.`;
