# Full-Stack AI: Credit Card Approval Prediction System 💳

## 📌 Overview
This project is a complete Full-Stack web application powered by Deep Learning. It predicts whether a credit card application will be approved or rejected based on applicant data. By integrating a trained Artificial Neural Network (ANN) model with a modern web interface, it provides real-time financial risk assessment.

## 🚀 Key Features
* **Modern Frontend:** A dynamic and responsive user interface built with React to collect user application data seamlessly.
* **Intelligent Backend:** A robust Python API serving the deep learning predictions.
* **Deep Learning Model:** A trained `.h5` ANN model utilizing a custom `scaler.pkl` to process and normalize complex financial datasets.

## 🛠️ Tech Stack
* **Frontend:** React (Vite, CSS)
* **Backend:** Python (Flask/FastAPI)
* **Machine Learning:** TensorFlow/Keras, Scikit-learn, Pandas, NumPy

## 📂 Project Structure
```text
credit-card-approval-ai-app/
│
├── client/                     # Frontend Application (React)
│   ├── src/                    # UI Components and styles
│   └── package.json            # Frontend dependencies
│
└── server/                     # Backend & AI Model
    ├── app.py                  # API server script
    ├── kredi_modeli.h5         # Saved Deep Learning ANN model
    ├── scaler.pkl              # Data normalization object
    └── credit_card_...csv      # Training dataset

cd server
python app.py

cd client
npm install
npm run dev
