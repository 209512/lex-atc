from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any
from sklearn.ensemble import IsolationForest
import numpy as np

app = FastAPI(title="Lex ATC ML Watcher API")

# Initialize Dummy ML Model without needing a .pkl file
# This demonstrates the actual data pipeline (Features -> ML Model -> Score)
dummy_model = IsolationForest(random_state=42, contamination=0.1)
# Fit with 100 random dummy rows (features: collisions, balance, initial_balance, active_proposals)
dummy_model.fit(np.random.rand(100, 4))

class MetricsPayload(BaseModel):
    agentId: str
    metrics: Dict[str, Any]

class PredictionResponse(BaseModel):
    agentId: str
    anomalyScore: float
    reason: str

@app.post("/predict", response_model=PredictionResponse)
async def predict_anomaly(payload: MetricsPayload):
    """
    ML Inference Endpoint using Dummy Isolation Forest.
    """
    metrics = payload.metrics
    
    features = [
        metrics.get("collisions", 0),
        metrics.get("balance", 0),
        metrics.get("initialBalance", 1000),
        metrics.get("activeProposals", 0)
    ]
    
    # Run Inference
    X = np.array([features])
    
    # IsolationForest decision_function: Positive = Normal, Negative = Anomaly
    # We invert it so higher score = more anomalous
    raw_score = -dummy_model.decision_function(X)[0] 
    
    # Normalize score (0.0 ~ 1.0)
    final_score = float(max(0.0, min(1.0, (raw_score + 0.5))))
    reason = "ML_ANOMALY_DETECTED" if final_score > 0.8 else "NORMAL"

    return PredictionResponse(
        agentId=payload.agentId,
        anomalyScore=final_score,
        reason=reason
    )

@app.get("/health")
async def health_check():
    return {"status": "ok"}
