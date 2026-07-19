// nrt_harness.scd — render a synth file offline (non-realtime).
// usage: sclang nrt_harness.scd <input.scd> <output.wav> [duration] [sampleRate]
// The input file must set ~def (SynthDef); optional ~events, ~duration.
(
var argv = thisProcess.argv;
var inPath, outPath, dur, sr, events, score, options, oscPath;

if(argv.size < 2) {
    "usage: sclang nrt_harness.scd in.scd out.wav [dur] [sr]".postln;
    1.exit;
};
inPath = argv[0];
outPath = argv[1];
dur = if(argv.size > 2) { argv[2].asFloat } { 4.0 };
sr = if(argv.size > 3) { argv[3].asInteger } { 48000 };

~def = nil; ~events = nil; ~duration = nil;

protect { inPath.load } { |error|
    if(error.notNil) {
        "HARNESS ERROR loading %: %".format(inPath, error.errorString).postln;
        1.exit;
    };
};

if(~def.isNil) {
    "HARNESS ERROR: % did not set ~def".format(inPath).postln;
    1.exit;
};
if(~duration.notNil) { dur = ~duration };

events = ~events ?? { [ [0.0, [\s_new, ~def.name, 1000, 0, 0]] ] };

score = Score(
    [ [0.0, [\d_recv, ~def.asBytes]] ]
    ++ events
    ++ [ [dur, [\c_set, 0, 0]] ]
);

options = ServerOptions.new
    .numOutputBusChannels_(2)
    .numInputBusChannels_(0);

oscPath = PathName.tmp +/+ "scloop_" ++ Date.getDate.stamp ++ ".osc";

score.recordNRT(
    oscFilePath: oscPath,
    outputFilePath: outPath,
    sampleRate: sr,
    headerFormat: "WAV",
    sampleFormat: "int24",
    options: options,
    duration: dur,
    action: {
        "RENDER OK: % (%s)".format(outPath, dur).postln;
        0.exit;
    }
);

SystemClock.sched(120) { "RENDER TIMEOUT".postln; 1.exit };
)
