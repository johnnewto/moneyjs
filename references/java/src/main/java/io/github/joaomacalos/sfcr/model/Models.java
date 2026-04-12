package io.github.joaomacalos.sfcr.model;

import java.util.Map;

public final class Models {
    private Models() {
    }

    public static ModelDefinition simBaseline() {
        return ModelDefinition.builder()
            .equation("TXs", "TXd")
            .equation("YD", "W * Ns - TXs")
            .equation("Cd", "alpha1 * YD + alpha2 * lag(Hh)")
            .equation("Hh", "YD - Cd + lag(Hh)")
            .equation("Ns", "Nd")
            .equation("Nd", "Y / W")
            .equation("Cs", "Cd")
            .equation("Gs", "Gd")
            .equation("Y", "Cs + Gs")
            .equation("TXd", "theta * W * Ns")
            .equation("Hs", "Gd - TXd + lag(Hs)")
            .external("Gd", 20.0)
            .external("W", 1.0)
            .external("alpha1", 0.6)
            .external("alpha2", 0.4)
            .external("theta", 0.2)
            .build();
    }

    public static Scenario simGovernmentSpendingShock() {
        return new Scenario(
            java.util.List.of(
                new Shock(
                    Map.of("Gd", ExternalSeries.constant("Gd", 30.0)),
                    5,
                    10
                )
            )
        );
    }

    public static ModelDefinition bmwBaseline() {
        return ModelDefinition.builder()
            .equation("Cs", "Cd")
            .equation("Is", "Id")
            .equation("Ns", "Nd")
            .equation("Ls", "lag(Ls) + Ld - lag(Ld)")
            .equation("Y", "Cs + Is")
            .equation("WBd", "Y - lag(rl) * lag(Ld) - AF")
            .equation("AF", "delta * lag(K)")
            .equation("Ld", "lag(Ld) + Id - AF")
            .equation("YD", "WBs + lag(rm) * lag(Mh)")
            .equation("Mh", "lag(Mh) + YD - Cd")
            .equation("Ms", "lag(Ms) + Ls - lag(Ls)")
            .equation("rm", "rl")
            .equation("WBs", "W * Ns")
            .equation("Nd", "Y / pr")
            .equation("W", "WBd / Nd")
            .equation("Cd", "alpha0 + alpha1 * YD + alpha2 * lag(Mh)")
            .equation("K", "lag(K) + Id - DA")
            .equation("DA", "delta * lag(K)")
            .equation("KT", "kappa * lag(Y)")
            .equation("Id", "gamma * (KT - lag(K)) + DA")
            .external("rl", 0.025)
            .external("alpha0", 20.0)
            .external("alpha1", 0.75)
            .external("alpha2", 0.10)
            .external("delta", 0.10)
            .external("gamma", 0.15)
            .external("kappa", 1.0)
            .external("pr", 1.0)
            .build();
    }

    public static ModelDefinition growthSyntaxSlice() {
        return ModelDefinition.builder()
            .equation("ER", "lag(N) / lag(Nfe)")
            .equation("z3a", "if (ER > (1 - BANDb)) {1} else {0}")
            .equation("z3b", "if (ER <= (1 + BANDt)) {1} else {0}")
            .equation("z3", "z3a * z3b")
            .equation("z4", "if (ER > (1 + BANDt)) {1} else {0}")
            .equation("z5", "if (ER < (1 - BANDb)) {1} else {0}")
            .equation("omegat", "exp(omega0 + omega1 * log(PR) + omega2 * log(ER + z3 * (1 - ER) - z4 * BANDt + z5 * BANDb))")
            .equation("PR", "lag(PR) * (1 + GRpr)")
            .equation("W", "lag(W) + omega3 * (omegat * lag(P) - lag(W))")
            .external("BANDb", 0.01)
            .external("BANDt", 0.01)
            .external("Nfe", 87.181)
            .external("omega0", -0.20594)
            .external("omega1", 1.0)
            .external("omega2", 2.0)
            .external("omega3", 0.45621)
            .external("GRpr", 0.03)
            .external("P", 7.1723)
            .external("N", 87.181)
            .initialValue("ER", 1.0)
            .initialValue("PR", 138659.0)
            .initialValue("W", 777968.0)
            .initialValue("omegat", 112852.0)
            .initialValue("z3a", 0.0)
            .initialValue("z3b", 0.0)
            .initialValue("z3", 0.0)
            .initialValue("z4", 0.0)
            .initialValue("z5", 0.0)
            .build();
    }

    public static ModelDefinition growthBaseline() {
        return GrowthModels.growthBaseline();
    }
}
