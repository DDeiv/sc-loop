// example: simple punchy kick drum
~def = SynthDef(\kick, { |out=0, freq=50, amp=0.8|
    var env = EnvGen.ar(Env.perc(0.001, 0.4, curve: -6), doneAction: 2);
    var pitch = EnvGen.ar(Env([120, freq], [0.03], \exp));
    var sig = SinOsc.ar(pitch) * env * amp;
    sig = (sig * 1.5).tanh;
    Out.ar(out, sig ! 2);
});
~events = [ [0.0, [\s_new, \kick, 1000, 0, 0]] ];
~duration = 1.0;
