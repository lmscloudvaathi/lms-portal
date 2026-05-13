"""List Gemini models that support generateContent (uses GEMINI_API_KEY from env)."""
import os
import sys

import google.generativeai as genai

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Set GEMINI_API_KEY in the environment (same as the backend).")
    sys.exit(1)

print(f"Checking API key prefix: {api_key[:10]}...")

try:
    genai.configure(api_key=api_key)
    print("Connecting to Google AI...")
    models = list(genai.list_models())
    print(f"Found {len(models)} models:")
    print("-" * 40)

    supported_models = []
    for m in models:
        if "generateContent" in m.supported_generation_methods:
            print(f"AVAILABLE: {m.name}")
            supported_models.append(m.name)
        else:
            print(f"(other):   {m.name}")

    print("-" * 40)

    if not supported_models:
        print("No models found that support text generation.")
    else:
        print("Use one of the AVAILABLE model names in main.py if needed.")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
