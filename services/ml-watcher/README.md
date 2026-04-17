# Lex ATC ML Watcher

ML Anomaly Detection API utilizing Scikit-Learn's Isolation Forest algorithm.
Generates an anomaly score based on agent metrics (collisions, balance drops, holding times, etc.) to trigger automatic disputes and economic slashing in the Settlement Engine.

## 🚀 Getting Started

This service is containerized and managed via the root `docker-compose.yml`.

### Endpoints
- **POST `/predict`**: Receives an array of agent metrics and returns an anomaly score for each agent.
  - **URL:** `http://localhost:8000/predict` (or `http://ml-watcher:8000/predict` inside the Docker network).

### Environment Variables
No specific environment variables are required to run this service locally, but it runs on port `8000` by default.

### Local Development
If you want to run it outside Docker:
```bash
pip install .
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
