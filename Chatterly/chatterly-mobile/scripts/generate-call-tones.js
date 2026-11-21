/* eslint-env node */
'use strict';

const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 22050;

function envelope(time, start, end) {
  const fade = 0.018;
  if (time < start || time >= end) return 0;
  return Math.min(1, (time - start) / fade, (end - time) / fade);
}

function writeWave(fileName, duration, sampleAt) {
  const sampleCount = Math.floor(SAMPLE_RATE * duration);
  const dataSize = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataSize);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(SAMPLE_RATE, 24);
  wave.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.max(-1, Math.min(1, sampleAt(index / SAMPLE_RATE)));
    wave.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }

  const outputDirectory = path.join(__dirname, '..', 'src', 'assets', 'sounds');
  fs.mkdirSync(outputDirectory, {recursive: true});
  fs.writeFileSync(path.join(outputDirectory, fileName), wave);
}

writeWave('incoming_call.wav', 4, time => {
  const windows = [[0, 0.72], [0.92, 1.64], [2.05, 2.77], [2.97, 3.69]];
  const level = windows.reduce((result, [start, end]) => Math.max(result, envelope(time, start, end)), 0);
  if (!level) return 0;
  const shimmer = 0.82 + 0.18 * Math.sin(2 * Math.PI * 5.2 * time);
  return level * shimmer * (
    0.20 * Math.sin(2 * Math.PI * 440 * time) +
    0.16 * Math.sin(2 * Math.PI * 554.37 * time) +
    0.12 * Math.sin(2 * Math.PI * 659.25 * time)
  );
});

writeWave('incoming_call_chime.wav', 4, time => {
  const notes = [523.25, 659.25, 783.99, 659.25];
  const index = Math.floor(time / 0.46) % notes.length;
  const local = time % 0.46;
  const level = envelope(local, 0, 0.34) * Math.exp(-2.4 * local);
  return level * (
    0.34 * Math.sin(2 * Math.PI * notes[index] * time) +
    0.12 * Math.sin(2 * Math.PI * notes[index] * 2 * time)
  );
});

writeWave('incoming_call_bell.wav', 4, time => {
  const local = time % 1.0;
  const level = envelope(local, 0, 0.72) * Math.exp(-3.8 * local);
  return level * (
    0.38 * Math.sin(2 * Math.PI * 659.25 * time) +
    0.18 * Math.sin(2 * Math.PI * 1318.5 * time) +
    0.08 * Math.sin(2 * Math.PI * 1977.75 * time)
  );
});

writeWave('incoming_call_pop.wav', 4, time => {
  const local = time % 0.66;
  const level = envelope(local, 0, 0.16) * Math.exp(-13 * local);
  const sweep = 720 - 1800 * local;
  return level * 0.62 * Math.sin(2 * Math.PI * Math.max(180, sweep) * time);
});

writeWave('outgoing_call.wav', 4, time => {
  const level = envelope(time, 0, 1.85);
  return level * (
    0.22 * Math.sin(2 * Math.PI * 440 * time) +
    0.22 * Math.sin(2 * Math.PI * 480 * time)
  );
});
