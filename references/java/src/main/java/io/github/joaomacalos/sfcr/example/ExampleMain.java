package io.github.joaomacalos.sfcr.example;

import io.github.joaomacalos.sfcr.engine.SfcrEngine;
import io.github.joaomacalos.sfcr.model.Models;
import io.github.joaomacalos.sfcr.model.SimulationOptions;
import io.github.joaomacalos.sfcr.result.SimulationResult;

public final class ExampleMain {
    private ExampleMain() {
    }

    public static void main(String[] args) {
        SimulationOptions options = SimulationOptions.builder()
            .periods(12)
            .hiddenEquation("Hh", "Hs")
            .hiddenTolerance(1e-5)
            .build();

        SimulationResult result = new SfcrEngine().runBaseline(Models.simBaseline(), options);

        for (int period = 0; period < options.periods(); period++) {
            System.out.printf(
                "period=%d Y=%.4f Cd=%.4f Hh=%.4f Hs=%.4f%n",
                period + 1,
                result.value("Y", period),
                result.value("Cd", period),
                result.value("Hh", period),
                result.value("Hs", period)
            );
        }
    }
}
