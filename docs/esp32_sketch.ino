// Minimal six-channel CSV sender for Arduino or ESP32.
// The browser expects one line of six comma-separated values at 9600 baud.

const int sensorPins[6] = {A0, A1, A2, A3, A4, A5};

void setup() {
  Serial.begin(9600);

#if defined(ESP32)
  analogReadResolution(10);
#endif
}

void loop() {
  for (int channel = 0; channel < 6; channel++) {
    if (channel > 0) {
      Serial.print(",");
    }
    Serial.print(analogRead(sensorPins[channel]));
  }
  Serial.println();
  delay(100);
}
