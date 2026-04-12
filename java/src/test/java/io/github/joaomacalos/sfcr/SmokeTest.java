package io.github.joaomacalos.sfcr;

import io.github.joaomacalos.sfcr.engine.SfcrEngine;
import io.github.joaomacalos.sfcr.model.ModelDefinition;
import io.github.joaomacalos.sfcr.model.Models;
import io.github.joaomacalos.sfcr.model.Scenario;
import io.github.joaomacalos.sfcr.model.SimulationOptions;
import io.github.joaomacalos.sfcr.model.SolverMethod;
import io.github.joaomacalos.sfcr.parser.Expression;
import io.github.joaomacalos.sfcr.parser.ExpressionParser;
import io.github.joaomacalos.sfcr.result.SimulationResult;

public final class SmokeTest {
    private SmokeTest() {
    }

    public static void main(String[] args) {
        parserSupportsLagAndArithmetic();
        parserSupportsFunctionsComparisonsAndConditionals();
        simBaselineMatchesReferenceValues();
        simScenarioMatchesReferenceValues();
        simBaselineMatchesReferenceValuesWithNewton();
        simBaselineMatchesReferenceValuesWithBroyden();
        bmwBaselineMatchesReferenceValuesWithNewton();
        growthSyntaxSliceMatchesReferenceValues();
        growthBaselineBuilds();
        System.out.println("Smoke tests passed");
    }

    private static void parserSupportsLagAndArithmetic() {
        ExpressionParser parser = new ExpressionParser();
        Expression expression = parser.parse("a + 2 * lag(b) - diff(c)");
        if (!expression.currentDependencies().contains("a") || !expression.currentDependencies().contains("c")) {
            throw new AssertionError("Expected parser to track current dependencies");
        }
        if (expression.currentDependencies().contains("b")) {
            throw new AssertionError("lag(b) should not create a current-period dependency");
        }
    }

    private static void parserSupportsFunctionsComparisonsAndConditionals() {
        ExpressionParser parser = new ExpressionParser();

        Expression math = parser.parse("exp(x) + log(y) + abs(z) + sqrt(w) + max(a, b) - min(c, d)");
        if (!math.currentDependencies().containsAll(java.util.Set.of("x", "y", "z", "w", "a", "b", "c", "d"))) {
            throw new AssertionError("Expected function parser to track dependencies");
        }

        Expression conditional = parser.parse("if (ER > (1 - BANDb)) {1} else {0}");
        if (!conditional.currentDependencies().containsAll(java.util.Set.of("ER", "BANDb"))) {
            throw new AssertionError("Expected conditional parser to track dependencies");
        }

        Expression comparison = parser.parse("if (ER <= (1 + BANDt)) {exp(v)} else {log(v)}");
        if (!comparison.currentDependencies().containsAll(java.util.Set.of("ER", "BANDt", "v"))) {
            throw new AssertionError("Expected nested conditional parser to track dependencies");
        }
    }

    private static void simBaselineMatchesReferenceValues() {
        SimulationResult result = new SfcrEngine().runBaseline(
            Models.simBaseline(),
            SimulationOptions.builder()
                .periods(10)
                .hiddenEquation("Hh", "Hs")
                .hiddenTolerance(1e-5)
                .build()
        );

        assertClose(result.value("Y", 1), 38.4615384615, 1e-6, "Y period 2");
        assertClose(result.value("Cd", 1), 18.4615384615, 1e-6, "Cd period 2");
        assertClose(result.value("Hh", 1), 12.3076923077, 1e-6, "Hh period 2");
        assertClose(result.value("Hs", 1), 12.3076923077, 1e-6, "Hs period 2");
        assertClose(result.value("TXd", 1), 7.6923076923, 1e-6, "TXd period 2");

        assertClose(result.value("Y", 9), 83.82883540578808, 2e-6, "Y period 10");
        assertClose(result.value("Cd", 9), 63.82883540578808, 2e-6, "Cd period 10");
        assertClose(result.value("Hh", 9), 62.21171894636690, 2e-6, "Hh period 10");
        assertClose(result.value("Hs", 9), 62.21171894636689, 2e-6, "Hs period 10");
        assertClose(result.value("TXd", 9), 16.76576708115762, 2e-6, "TXd period 10");

        for (int period = 0; period < 10; period++) {
            assertClose(result.value("Hh", period), result.value("Hs", period), 1e-5, "Hidden equation period " + (period + 1));
        }

        if (result.blocks().isEmpty()) {
            throw new AssertionError("Expected dependency blocks to be populated");
        }
    }

    private static void simScenarioMatchesReferenceValues() {
        SfcrEngine engine = new SfcrEngine();
        SimulationOptions baselineOptions = SimulationOptions.builder()
            .periods(10)
            .hiddenEquation("Hh", "Hs")
            .hiddenTolerance(1e-5)
            .build();

        SimulationResult baseline = engine.runBaseline(Models.simBaseline(), baselineOptions);
        Scenario scenario = Models.simGovernmentSpendingShock();
        SimulationResult result = engine.runScenario(baseline, scenario, baselineOptions);

        assertClose(result.value("Gd", 0), 20.0, 1e-9, "Scenario Gd period 1");
        assertClose(result.value("Y", 0), 83.82883540578808, 2e-6, "Scenario Y period 1");
        assertClose(result.value("Gd", 4), 30.0, 1e-9, "Scenario Gd period 5");
        assertClose(result.value("Y", 4), 110.94107274679271, 2e-6, "Scenario Y period 5");
        assertClose(result.value("Cd", 4), 80.94107274679271, 2e-6, "Scenario Cd period 5");
        assertClose(result.value("Hh", 4), 77.03518002468732, 2e-6, "Scenario Hh period 5");
        assertClose(result.value("TXd", 4), 22.18821454775088, 2e-6, "Scenario TXd period 5");
        assertClose(result.value("Y", 9), 133.05791032826815, 2e-6, "Scenario Y period 10");
        assertClose(result.value("Cd", 9), 103.05791032826815, 2e-6, "Scenario Cd period 10");
        assertClose(result.value("Hh", 9), 101.36370136389729, 2e-6, "Scenario Hh period 10");
        assertClose(result.value("Hs", 9), 101.36370144004169, 1e-5, "Scenario Hs period 10");
    }

    private static void simBaselineMatchesReferenceValuesWithNewton() {
        SimulationResult result = new SfcrEngine().runBaseline(
            Models.simBaseline(),
            SimulationOptions.builder()
                .periods(10)
                .solverMethod(SolverMethod.NEWTON)
                .hiddenEquation("Hh", "Hs")
                .hiddenTolerance(1e-5)
                .tolerance(1e-10)
                .build()
        );

        assertClose(result.value("Y", 1), 38.4615384615, 1e-5, "Newton SIM Y period 2");
        assertClose(result.value("Cd", 1), 18.4615384615, 1e-5, "Newton SIM Cd period 2");
        assertClose(result.value("Hh", 9), 62.21171894636690, 1e-4, "Newton SIM Hh period 10");
        assertClose(result.value("Hs", 9), 62.21171894636689, 1e-4, "Newton SIM Hs period 10");
    }

    private static void simBaselineMatchesReferenceValuesWithBroyden() {
        SimulationResult result = new SfcrEngine().runBaseline(
            Models.simBaseline(),
            SimulationOptions.builder()
                .periods(10)
                .solverMethod(SolverMethod.BROYDEN)
                .hiddenEquation("Hh", "Hs")
                .hiddenTolerance(1e-5)
                .tolerance(1e-10)
                .build()
        );

        assertClose(result.value("Y", 9), 83.82883540578808, 1e-4, "Broyden SIM Y period 10");
        assertClose(result.value("Cd", 9), 63.82883540578808, 1e-4, "Broyden SIM Cd period 10");
        assertClose(result.value("Hh", 9), 62.21171894636690, 1e-4, "Broyden SIM Hh period 10");
        assertClose(result.value("Hs", 9), 62.21171894636689, 1e-4, "Broyden SIM Hs period 10");
        assertClose(result.value("TXd", 9), 16.76576708115762, 1e-4, "Broyden SIM TXd period 10");
    }

    private static void bmwBaselineMatchesReferenceValuesWithNewton() {
        SimulationResult result = new SfcrEngine().runBaseline(
            Models.bmwBaseline(),
            SimulationOptions.builder()
                .periods(12)
                .solverMethod(SolverMethod.NEWTON)
                .tolerance(1e-10)
                .maxIterations(100)
                .build()
        );

        assertClose(result.value("Y", 1), 80.000022119984067, 1e-3, "BMW Y period 2");
        assertClose(result.value("Cd", 1), 80.000022119984067, 1e-3, "BMW Cd period 2");
        assertClose(result.value("W", 1), 1.0000000195603564, 1e-5, "BMW W period 2");

        assertClose(result.value("Y", 11), 171.211882967247703, 1e-3, "BMW Y period 12");
        assertClose(result.value("Cd", 11), 151.622339835634676, 1e-3, "BMW Cd period 12");
        assertClose(result.value("Id", 11), 19.5895431316130342, 1e-3, "BMW Id period 12");
        assertClose(result.value("K", 11), 135.272892541369743, 1e-3, "BMW K period 12");
        assertClose(result.value("Mh", 11), 135.2729032243398, 1e-3, "BMW Mh period 12");
        assertClose(result.value("W", 11), 0.9061564443779875, 1e-4, "BMW W period 12");
    }

    private static void growthSyntaxSliceMatchesReferenceValues() {
        SimulationResult result = new SfcrEngine().runBaseline(
            Models.growthSyntaxSlice(),
            SimulationOptions.builder()
                .periods(6)
                .solverMethod(SolverMethod.BROYDEN)
                .tolerance(1e-12)
                .build()
        );

        assertClose(result.value("ER", 1), 1.0, 1e-9, "Growth slice ER period 2");
        assertClose(result.value("z3a", 1), 1.0, 1e-9, "Growth slice z3a period 2");
        assertClose(result.value("z3b", 1), 1.0, 1e-9, "Growth slice z3b period 2");
        assertClose(result.value("z3", 1), 1.0, 1e-9, "Growth slice z3 period 2");
        assertClose(result.value("z4", 1), 0.0, 1e-9, "Growth slice z4 period 2");
        assertClose(result.value("z5", 1), 0.0, 1e-9, "Growth slice z5 period 2");
        assertClose(result.value("PR", 1), 142818.77, 1e-6, "Growth slice PR period 2");
        assertClose(result.value("omegat", 1), 116237.6129875987, 1e-4, "Growth slice omegat period 2");
        assertClose(result.value("W", 1), 423051.2187200001, 1e-3, "Growth slice W period 2");

        assertClose(result.value("PR", 5), 160743.7838683637, 1e-3, "Growth slice PR period 6");
        assertClose(result.value("omegat", 5), 130826.4574709128, 1e-3, "Growth slice omegat period 6");
        assertClose(result.value("W", 5), 873381.5792705123, 1e-3, "Growth slice W period 6");
    }

    private static void growthBaselineBuilds() {
        ModelDefinition model = Models.growthBaseline();
        if (model.equations().size() < 100) {
            throw new AssertionError("Expected growth baseline to contain the full equation set");
        }
        if (model.externals().size() < 50) {
            throw new AssertionError("Expected growth baseline to contain the full external set");
        }
        if (model.initialValues().size() < 100) {
            throw new AssertionError("Expected growth baseline to contain the full initial value set");
        }
    }

    private static void assertClose(double actual, double expected, double tolerance, String label) {
        if (Math.abs(actual - expected) > tolerance) {
            throw new AssertionError(label + " expected " + expected + " but found " + actual);
        }
    }
}
