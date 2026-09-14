"""CLI: predict glucose from acetone + environment."""

import argparse

from glucose_model import model_available, predict_glucose_mg_dl


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--ppm", type=float, required=True)
    parser.add_argument("--temp", type=float, required=True)
    parser.add_argument("--humidity", type=float, required=True)
    args = parser.parse_args()

    if not model_available():
        print("No trained model. Run: python train_glucose_model.py")
        return

    mg_dl = predict_glucose_mg_dl(args.ppm, args.temp, args.humidity)
    print(f"Estimated blood glucose: {mg_dl} mg/dL")


if __name__ == "__main__":
    main()
