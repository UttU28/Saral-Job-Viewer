import os
import json
import requests
from dotenv import load_dotenv
from typing import Optional, Dict, Any

# Load environment variables
load_dotenv()

class AIProvider:
    """Base class for AI providers"""
    
    def __init__(self):
        self.provider_type = None
        
    def chat(self, prompt: str) -> str:
        """Send a chat prompt and get response"""
        raise NotImplementedError("Subclasses must implement chat method")

class OpenAIProvider(AIProvider):
    """OpenAI API provider"""
    
    def __init__(self):
        super().__init__()
        self.provider_type = "openai"
        self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY not found in environment variables")
    
    def chat(self, prompt: str) -> str:
        """Send chat request to OpenAI API"""
        try:
            import openai
            
            # Set the API key
            openai.api_key = self.api_key
            
            # Make the API call
            response = openai.ChatCompletion.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=2000,
                temperature=0.7
            )
            
            return response.choices[0].message.content.strip()
            
        except ImportError:
            return "Error: OpenAI library not installed. Run: pip install openai"
        except Exception as e:
            return f"Error with OpenAI API: {str(e)}"

class OllamaProvider(AIProvider):
    """Ollama local API provider"""
    
    def __init__(self):
        super().__init__()
        self.provider_type = "ollama"
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model = os.getenv("OLLAMA_MODEL", "llama3.2")
    
    def chat(self, prompt: str) -> str:
        """Send chat request to Ollama API"""
        try:
            url = f"{self.base_url}/api/generate"
            
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False
            }
            
            response = requests.post(url, json=payload, timeout=30)
            
            if response.status_code == 200:
                result = response.json()
                return result.get("response", "No response received")
            else:
                return f"Error: Ollama API returned status {response.status_code}"
                
        except requests.exceptions.ConnectionError:
            return "Error: Could not connect to Ollama. Make sure Ollama is running on localhost:11434"
        except Exception as e:
            return f"Error with Ollama API: {str(e)}"

class AIManager:
    """Manager class to switch between AI providers"""
    
    def __init__(self, provider_type: str = None):
        self.provider_type = provider_type or os.getenv("AI_PROVIDER", "openai").lower()
        self.provider = None
        self._initialize_provider()
    
    def _initialize_provider(self):
        """Initialize the selected AI provider"""
        try:
            if self.provider_type == "openai":
                self.provider = OpenAIProvider()
            elif self.provider_type == "ollama":
                self.provider = OllamaProvider()
            else:
                raise ValueError(f"Unsupported AI provider: {self.provider_type}")
        except Exception as e:
            self.provider = None
    
    def chat(self, prompt: str) -> str:
        """Send chat prompt using the selected provider"""
        if not self.provider:
            return f"Error: {self.provider_type} provider not initialized"
        
        return self.provider.chat(prompt)
    
    def switch_provider(self, new_provider: str):
        """Switch to a different AI provider"""
        self.provider_type = new_provider.lower()
        self._initialize_provider()
        return f"Switched to {self.provider_type} provider"

# Convenience functions
def get_ai_response(prompt: str, provider: str = None) -> str:
    """Get AI response using specified or default provider"""
    manager = AIManager(provider)
    return manager.chat(prompt)

def safe_ai_call(prompt: str, provider: str = None) -> Dict[str, Any]:
    """Safely call AI with proper error handling"""
    try:
        response = get_ai_response(prompt, provider)
        return {
            "success": True,
            "response": response,
            "error": None
        }
    except Exception as e:
        return {
            "success": False,
            "response": None,
            "error": str(e)
        }
