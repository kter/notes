import httpx

API_URL = "https://api.notes.dev.devtools.site"
AUTH_TOKEN = "dev-integration-test-token"  # noqa: S105

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json",
}


def cleanup():
    with httpx.Client(base_url=API_URL, headers=headers, timeout=30.0) as client:
        # 1. List tokens
        print("Listing tokens...")
        response = client.get("/api/mcp/tokens")
        if response.status_code != 200:
            print(f"Failed to list tokens: {response.status_code} {response.text}")
            return

        tokens = response.json().get("tokens", [])
        print(f"Found {len(tokens)} tokens.")

        # 2. Delete each token
        for token in tokens:
            token_id = token["id"]
            print(f"Deleting token {token_id} ({token['name']})...")
            del_resp = client.delete(f"/api/mcp/tokens/{token_id}")
            if del_resp.status_code == 200:
                print(f"Successfully deleted {token_id}")
            else:
                print(f"Failed to delete {token_id}: {del_resp.status_code}")


if __name__ == "__main__":
    cleanup()
