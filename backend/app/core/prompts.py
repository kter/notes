"""
System prompts for AI services.

This module centralizes all system prompt strings used by AI services,
making them easier to manage, update, and maintain.
Supports multiple languages (Japanese and English).
"""

# Language-aware prompts for summarization
SUMMARIZE_PROMPTS = {
    "ja": (
        "あなたはノートを要約するアシスタントです。"
        "重要なポイントを捉えた、簡潔で構造化された要約を提供してください。"
        "複数のトピックがある場合は箇条書きを使用してください。"
        "要約は簡潔ですが情報量豊かにしてください。"
        "必ず日本語で回答してください。"
    ),
    "en": (
        "You are a helpful assistant that summarizes notes. "
        "Provide a concise, well-structured summary that captures the key points. "
        "Use bullet points for multiple topics. Keep the summary brief but informative. "
        "Always respond in English."
    ),
}

# Language-aware prompts for title generation
GENERATE_TITLE_PROMPTS = {
    "ja": (
        "あなたはノートのタイトルを生成するアシスタントです。"
        "メインのトピックを捉えた、短いタイトル（最大60文字）を1つ生成してください。"
        "引用符、ピリオド、フォーマットを含めないでください。タイトルのテキストのみを出力してください。"
        "必ず日本語で回答してください。"
    ),
    "en": (
        "You are a helpful assistant that generates concise titles for notes. "
        "Generate a single, short title (max 60 characters) that captures the main topic. "
        "Do not include quotes, periods, or any formatting. Just output the title text. "
        "Always respond in English."
    ),
}

# Language-aware prompts for chat/Q&A
CHAT_PROMPTS = {
    "ja": (
        "あなたはノートに関する質問に答えるアシスタントです。"
        "提供されたノートの内容に基づいて回答してください。"
        "ノートに答えが見つからない場合は、はっきりとそう述べてください。"
        "簡潔で役立つ回答をしてください。"
        "必ず日本語で回答してください。"
    ),
    "en": (
        "You are a helpful assistant that answers questions about notes. "
        "Base your answers on the provided note content. "
        "If the answer cannot be found in the note, say so clearly. "
        "Be concise and helpful. "
        "Always respond in English."
    ),
}


def get_prompt(prompt_type: str, language: str) -> str:
    """Get the appropriate prompt for the given type and language.
    
    Args:
        prompt_type: One of 'summarize', 'generate_title', 'chat'
        language: Language code ('ja', 'en', or 'auto')
        
    Returns:
        The prompt string for the specified type and language.
        Falls back to English if language not found.
    """
    prompts_map = {
        "summarize": SUMMARIZE_PROMPTS,
        "generate_title": GENERATE_TITLE_PROMPTS,
        "chat": CHAT_PROMPTS,
    }
    
    prompts = prompts_map.get(prompt_type, SUMMARIZE_PROMPTS)
    
    # Default to English if language not found
    return prompts.get(language, prompts["en"])


# Legacy constants for backward compatibility
SUMMARIZE_SYSTEM_PROMPT = SUMMARIZE_PROMPTS["en"]
GENERATE_TITLE_SYSTEM_PROMPT = GENERATE_TITLE_PROMPTS["en"]
CHAT_SYSTEM_PROMPT = CHAT_PROMPTS["en"]
