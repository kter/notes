---
description: Deploy to dev or prd environment
---

1. Check the environment to deploy to (dev or prd).
2. If the user asks to deploy to dev:
   - Run the following command in the repository root:
     ```bash
     ENV=dev make deploy
     ```

3. If the user asks to deploy to prd:
   - Run the following command in the repository root:
     ```bash
     ENV=prd make deploy
     ```
