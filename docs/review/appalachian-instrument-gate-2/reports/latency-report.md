# Frolic candidate latency report

Status: human review required

| Measurement | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| Input to simulation receipt | 0.1 ms | 0.2 ms | 0.4 ms |
| Input to audio scheduling call | 164.2 ms | 169.1 ms | 174.6 ms |
| Input to first changed hero pixel | 1.2 ms | 18 ms | 20.7 ms |
| Input to first action frame | 0.5 ms | 0.7 ms | 1.2 ms |

The harness injected 100 keyboard, 100 pointer, and 100 simulated gamepad
edges. Effects and camera shake were disabled. Pixel comparison was limited to
the hero rectangle and performed immediately around the input dispatch.

AudioContext base latency: 0.012 s p50.
AudioContext output latency: 0.36 s p50.

The browser/device latency values are not included in the scheduling-call
measurement.
