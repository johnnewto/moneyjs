package io.github.joaomacalos.sfcr.model;

final class GrowthModels {
    private GrowthModels() {
    }

    static ModelDefinition growthBaseline() {
        ModelDefinition.Builder builder = ModelDefinition.builder()
            .equation("Yk", "Ske + INke - INk[-1]")
            .equation("Ske", "beta * Sk + (1 - beta) * Sk[-1] * (1 + (GRpr + RA))")
            .equation("INke", "INk[-1] + gamma * (INkt - INk[-1])")
            .equation("INkt", "sigmat * Ske")
            .equation("INk", "INk[-1] + Yk - Sk - NPL / UC")
            .equation("Kk", "Kk[-1] * (1 + GRk)")
            .equation("GRk", "gamma0 + gammau * U[-1] - gammar * RRl")
            .equation("U", "Yk / Kk[-1]")
            .equation("RRl", "((1 + Rl) / (1 + PI)) - 1")
            .equation("PI", "(P - P[-1]) / P[-1]")
            .equation("Ik", "(Kk - Kk[-1]) + delta * Kk[-1]")
            .equation("Sk", "Ck + Gk + Ik")
            .equation("S", "Sk * P")
            .equation("IN", "INk * UC")
            .equation("INV", "Ik * P")
            .equation("K", "Kk * P")
            .equation("Y", "Sk * P + (INk - INk[-1]) * UC")
            .equation("omegat", "exp(omega0 + omega1 * log(PR) + omega2 * log(ER + z3 * (1 - ER) - z4 * BANDt + z5 * BANDb))")
            .equation("ER", "N[-1] / Nfe[-1]")
            .equation("z3a", "if (ER > (1 - BANDb)) {1} else {0}")
            .equation("z3b", "if (ER <= (1 + BANDt)) {1} else {0}")
            .equation("z3", "z3a * z3b")
            .equation("z4", "if (ER > (1 + BANDt)) {1} else {0}")
            .equation("z5", "if (ER < (1 - BANDb)) {1} else {0}")
            .equation("W", "W[-1] + omega3 * (omegat * P[-1] - W[-1])")
            .equation("PR", "PR[-1] * (1 + GRpr)")
            .equation("Nt", "Yk / PR")
            .equation("N", "N[-1] + etan * (Nt - N[-1])")
            .equation("WB", "N * W")
            .equation("UC", "WB / Yk")
            .equation("NUC", "W / PR")
            .equation("NHUC", "(1 - sigman) * NUC + sigman * (1 + Rln[-1]) * NUC[-1]")
            .equation("P", "(1 + phi) * NHUC")
            .equation("phi", "phi[-1] + eps2 * (phit[-1] - phi[-1])")
            .equation("phit", "(FUft + FDf + Rl[-1] * (Lfd[-1] - IN[-1])) / ((1 - sigmase) * Ske * UC + (1 + Rl[-1]) * sigmase * Ske * UC[-1])")
            .equation("HCe", "(1 - sigmase) * Ske * UC + (1 + Rl[-1]) * sigmase * Ske * UC[-1]")
            .equation("sigmase", "INk[-1] / Ske")
            .equation("Fft", "FUft + FDf + Rl[-1] * (Lfd[-1] - IN[-1])")
            .equation("FUft", "psiu * INV[-1]")
            .equation("FDf", "psid * Ff[-1]")
            .equation("Ff", "S - WB + (IN - IN[-1]) - Rl[-1] * IN[-1]")
            .equation("FUf", "Ff - FDf - Rl[-1] * (Lfd[-1] - IN[-1]) + Rl[-1] * NPL")
            .equation("Lfd", "Lfd[-1] + INV + (IN - IN[-1]) - FUf - (Eks - Eks[-1]) * Pe - NPL")
            .equation("NPL", "NPLk * Lfs[-1]")
            .equation("Eks", "Eks[-1] + ((1 - psiu) * INV[-1]) / Pe")
            .equation("Rk", "FDf / (Pe[-1] * Ekd[-1])")
            .equation("PE", "Pe / (Ff / Eks[-1])")
            .equation("Q", "(Eks * Pe + Lfd) / (K + IN)")
            .equation("YP", "WB + FDf + FDb + Rm[-1] * Mh[-1] + Rb[-1] * Bhd[-1] + BLs[-1]")
            .equation("TX", "theta * YP")
            .equation("YDr", "YP - TX - Rl[-1] * Lhd[-1]")
            .equation("YDhs", "YDr + CG")
            .equation("CG", "(Pbl - Pbl[-1]) * BLd[-1] + (Pe - Pe[-1]) * Ekd[-1] + (OFb - OFb[-1])")
            .equation("V", "V[-1] + YDr - CONS + (Pbl - Pbl[-1]) * BLd[-1] + (Pe - Pe[-1]) * Ekd[-1] + (OFb - OFb[-1])")
            .equation("Vk", "V / P")
            .equation("CONS", "Ck * P")
            .equation("Ck", "alpha1 * (YDkre + NLk) + alpha2 * Vk[-1]")
            .equation("YDkre", "eps * YDkr + (1 - eps) * (YDkr[-1] * (1 + GRpr))")
            .equation("YDkr", "YDr / P - ((P - P[-1]) * Vk[-1]) / P")
            .equation("GL", "eta * YDr")
            .equation("eta", "eta0 - etar * RRl")
            .equation("NL", "GL - REP")
            .equation("REP", "deltarep * Lhd[-1]")
            .equation("Lhd", "Lhd[-1] + GL - REP")
            .equation("NLk", "NL / P")
            .equation("BUR", "(REP + Rl[-1] * Lhd[-1]) / YDr[-1]")
            .equation("Bhd", "Vfma[-1] * (lambda20 + lambda22 * Rb[-1] - lambda21 * Rm[-1] - lambda24 * Rk[-1] - lambda23 * Rbl[-1] - lambda25 * (YDr / V))")
            .equation("BLd", "Vfma[-1] * (lambda30 - lambda32 * Rb[-1] - lambda31 * Rm[-1] - lambda34 * Rk[-1] + lambda33 * Rbl[-1] - lambda35 * (YDr / V)) / Pbl")
            .equation("Pe", "Vfma[-1] * (lambda40 - lambda42 * Rb[-1] - lambda41 * Rm[-1] + lambda44 * Rk[-1] - lambda43 * Rbl[-1] - lambda45 * (YDr / V)) / Ekd")
            .equation("Mh", "Vfma - Bhd - Pe * Ekd - Pbl * BLd + Lhd")
            .equation("Vfma", "V - Hhd - OFb")
            .equation("VfmaA", "Mh + Bhd + Pbl * BLd + Pe * Ekd")
            .equation("Hhd", "lambdac * CONS")
            .equation("Ekd", "Eks")
            .equation("G", "Gk * P")
            .equation("Gk", "Gk[-1] * (1 + GRg)")
            .equation("PSBR", "G + BLs[-1] + Rb[-1] * (Bbs[-1] + Bhs[-1]) - TX")
            .equation("Bs", "Bs[-1] + G - TX - (BLs - BLs[-1]) * Pbl + Rb[-1] * (Bhs[-1] + Bbs[-1]) + BLs[-1]")
            .equation("GD", "Bbs + Bhs + BLs * Pbl + Hs")
            .equation("Fcb", "Rb[-1] * Bcbd[-1]")
            .equation("BLs", "BLd")
            .equation("Bhs", "Bhd")
            .equation("Hhs", "Hhd")
            .equation("Hbs", "Hbd")
            .equation("Hs", "Hbs + Hhs")
            .equation("Bcbd", "Hs")
            .equation("Bcbs", "Bcbd")
            .equation("Rb", "Rbbar")
            .equation("Rbl", "Rb + ADDbl")
            .equation("Pbl", "1 / Rbl")
            .equation("Ms", "Mh")
            .equation("Lfs", "Lfd")
            .equation("Lhs", "Lhd")
            .equation("Hbd", "ro * Ms")
            .equation("Bbs", "Bbs[-1] + (Bs - Bs[-1]) - (Bhs - Bhs[-1]) - (Bcbs - Bcbs[-1])")
            .equation("Bbd", "Ms + OFb - Lfs - Lhs - Hbd")
            .equation("BLR", "Bbd / Ms")
            .equation("Rm", "Rm[-1] + z1a * xim1 + z1b * xim2 - z2a * xim1 - z2b * xim2")
            .equation("z2a", "if (BLR[-1] > (top + 0.05)) {1} else {0}")
            .equation("z2b", "if (BLR[-1] > top) {1} else {0}")
            .equation("z1a", "if (BLR[-1] <= bot) {1} else {0}")
            .equation("z1b", "if (BLR[-1] <= (bot - 0.05)) {1} else {0}")
            .equation("Rl", "Rm + ADDl")
            .equation("OFbt", "NCAR * (Lfs[-1] + Lhs[-1])")
            .equation("OFbe", "OFb[-1] + betab * (OFbt - OFb[-1])")
            .equation("FUbt", "OFbe - OFb[-1] + NPLke * Lfs[-1]")
            .equation("NPLke", "epsb * NPLke[-1] + (1 - epsb) * NPLk[-1]")
            .equation("FDb", "Fb - FUb")
            .equation("Fbt", "lambdab * Y[-1] + (OFbe - OFb[-1] + NPLke * Lfs[-1])")
            .equation("Fb", "Rl[-1] * (Lfs[-1] + Lhs[-1] - NPL) + Rb[-1] * Bbd[-1] - Rm[-1] * Ms[-1]")
            .equation("ADDl", "(Fbt - Rb[-1] * Bbd[-1] + Rm[-1] * (Ms[-1] - (1 - NPLke) * Lfs[-1] - Lhs[-1])) / ((1 - NPLke) * Lfs[-1] + Lhs[-1])")
            .equation("FUb", "Fb - lambdab * Y[-1]")
            .equation("OFb", "OFb[-1] + FUb - NPL")
            .equation("CAR", "OFb / (Lfs + Lhs)")
            .equation("Vf", "IN + K - Lfd - Ekd * Pe")
            .equation("Ls", "Lfs + Lhs");

        external(builder, "alpha1", "0.75");
        external(builder, "alpha2", "0.064");
        external(builder, "beta", "0.5");
        external(builder, "betab", "0.4");
        external(builder, "gamma", "0.15");
        external(builder, "gamma0", "0.00122");
        external(builder, "gammar", "0.1");
        external(builder, "gammau", "0.05");
        external(builder, "delta", "0.10667");
        external(builder, "deltarep", "0.1");
        external(builder, "eps", "0.5");
        external(builder, "eps2", "0.8");
        external(builder, "epsb", "0.25");
        external(builder, "epsrb", "0.9");
        external(builder, "eta0", "0.07416");
        external(builder, "etan", "0.6");
        external(builder, "etar", "0.4");
        external(builder, "theta", "0.22844");
        external(builder, "lambda20", "0.25");
        external(builder, "lambda21", "2.2");
        external(builder, "lambda22", "6.6");
        external(builder, "lambda23", "2.2");
        external(builder, "lambda24", "2.2");
        external(builder, "lambda25", "0.1");
        external(builder, "lambda30", "-0.04341");
        external(builder, "lambda31", "2.2");
        external(builder, "lambda32", "2.2");
        external(builder, "lambda33", "6.6");
        external(builder, "lambda34", "2.2");
        external(builder, "lambda35", "0.1");
        external(builder, "lambda40", "0.67132");
        external(builder, "lambda41", "2.2");
        external(builder, "lambda42", "2.2");
        external(builder, "lambda43", "2.2");
        external(builder, "lambda44", "6.6");
        external(builder, "lambda45", "0.1");
        external(builder, "lambdab", "0.0153");
        external(builder, "lambdac", "0.05");
        external(builder, "xim1", "0.0008");
        external(builder, "xim2", "0.0007");
        external(builder, "ro", "0.05");
        external(builder, "sigman", "0.1666");
        external(builder, "sigmat", "0.2");
        external(builder, "psid", "0.15255");
        external(builder, "psiu", "0.92");
        external(builder, "omega0", "-0.20594");
        external(builder, "omega1", "1");
        external(builder, "omega2", "2");
        external(builder, "omega3", "0.45621");
        external(builder, "ADDbl", "0.02");
        external(builder, "BANDt", "0.01");
        external(builder, "BANDb", "0.01");
        external(builder, "bot", "0.05");
        external(builder, "GRg", "0.03");
        external(builder, "GRpr", "0.03");
        external(builder, "Nfe", "87.181");
        external(builder, "NCAR", "0.1");
        external(builder, "NPLk", "0.02");
        external(builder, "Rbbar", "0.035");
        external(builder, "Rln", "0.07");
        external(builder, "RA", "0");
        external(builder, "top", "0.12");

        initial(builder, "sigmase", "0.16667");
        initial(builder, "eta", "0.04918");
        initial(builder, "phi", "0.26417");
        initial(builder, "phit", "0.26417");
        initial(builder, "ADDbl", "0.02");
        initial(builder, "BANDt", "0.01");
        initial(builder, "BANDb", "0.01");
        initial(builder, "bot", "0.05");
        initial(builder, "GRg", "0.03");
        initial(builder, "GRpr", "0.03");
        initial(builder, "Nfe", "87.181");
        initial(builder, "NCAR", "0.1");
        initial(builder, "NPLk", "0.02");
        initial(builder, "Rbbar", "0.035");
        initial(builder, "Rln", "0.07");
        initial(builder, "RA", "0");
        initial(builder, "top", "0.12");
        initial(builder, "ADDl", "0.04592");
        initial(builder, "BLR", "0.1091");
        initial(builder, "BUR", "0.06324");
        initial(builder, "Ck", "7334240");
        initial(builder, "CAR", "0.09245");
        initial(builder, "CONS", "52603100");
        initial(builder, "ER", "1");
        initial(builder, "Fb", "1744130");
        initial(builder, "Fbt", "1744140");
        initial(builder, "Ff", "18081100");
        initial(builder, "Fft", "18013600");
        initial(builder, "FDb", "1325090");
        initial(builder, "FDf", "2670970");
        initial(builder, "FUb", "419039");
        initial(builder, "FUf", "15153800");
        initial(builder, "FUft", "15066200");
        initial(builder, "G", "16755600");
        initial(builder, "Gk", "2336160");
        initial(builder, "GL", "2775900");
        initial(builder, "GRk", "0.03001");
        initial(builder, "INV", "16911600");
        initial(builder, "Ik", "2357910");
        initial(builder, "N", "87.181");
        initial(builder, "Nt", "87.181");
        initial(builder, "NHUC", "5.6735");
        initial(builder, "NL", "683593");
        initial(builder, "NLk", "95311");
        initial(builder, "NPL", "309158");
        initial(builder, "NPLke", "0.02");
        initial(builder, "NUC", "5.6106");
        initial(builder, "omegat", "112852");
        initial(builder, "P", "7.1723");
        initial(builder, "Pbl", "18.182");
        initial(builder, "Pe", "17937");
        initial(builder, "PE", "5.07185");
        initial(builder, "PI", "0.0026");
        initial(builder, "PR", "138659");
        initial(builder, "PSBR", "1894780");
        initial(builder, "Q", "0.77443");
        initial(builder, "Rb", "0.035");
        initial(builder, "Rbl", "0.055");
        initial(builder, "Rk", "0.03008");
        initial(builder, "Rl", "0.06522");
        initial(builder, "Rm", "0.0193");
        initial(builder, "REP", "2092310");
        initial(builder, "RRl", "0.06246");
        initial(builder, "S", "86270300");
        initial(builder, "Sk", "12028300");
        initial(builder, "Ske", "12028300");
        initial(builder, "TX", "17024100");
        initial(builder, "U", "0.70073");
        initial(builder, "UC", "5.6106");
        initial(builder, "W", "777968");
        initial(builder, "WB", "67824000");
        initial(builder, "Y", "86607700");
        initial(builder, "Yk", "12088400");
        initial(builder, "YDr", "56446400");
        initial(builder, "YDkr", "7813270");
        initial(builder, "YDkre", "7813290");
        initial(builder, "YP", "73158700");
        initial(builder, "z1a", "0");
        initial(builder, "z1b", "0");
        initial(builder, "z2a", "0");
        initial(builder, "z2b", "0");
        initial(builder, "Bbd", "4389790");
        initial(builder, "Bbs", "4389790");
        initial(builder, "Bcbd", "4655690");
        initial(builder, "Bcbs", "4655690");
        initial(builder, "Bhd", "33439320");
        initial(builder, "Bhs", "33439320");
        initial(builder, "Bs", "42484800");
        initial(builder, "BLd", "840742");
        initial(builder, "BLs", "840742");
        initial(builder, "GD", "57728700");
        initial(builder, "Ekd", "5112.6001");
        initial(builder, "Eks", "5112.6001");
        initial(builder, "Hbd", "2025540");
        initial(builder, "Hbs", "2025540");
        initial(builder, "Hhd", "2630150");
        initial(builder, "Hhs", "2630150");
        initial(builder, "Hs", "4655690");
        initial(builder, "IN", "11585400");
        initial(builder, "INk", "2064890");
        initial(builder, "INke", "2405660");
        initial(builder, "INkt", "2064890");
        initial(builder, "K", "127486471");
        initial(builder, "Kk", "17774838");
        initial(builder, "Lfd", "15962900");
        initial(builder, "Lfs", "15962900");
        initial(builder, "Lhd", "21606600");
        initial(builder, "Lhs", "21606600");
        initial(builder, "Ls", "37569500");
        initial(builder, "Mh", "40510800");
        initial(builder, "Ms", "40510800");
        initial(builder, "OFb", "3474030");
        initial(builder, "OFbe", "3474030");
        initial(builder, "OFbt", "3638100");
        initial(builder, "V", "165438779");
        initial(builder, "Vfma", "159334599");
        initial(builder, "Vk", "23066350");
        initial(builder, "Vf", "31361792");

        return builder.build();
    }

    private static void external(ModelDefinition.Builder builder, String name, String value) {
        builder.external(name, Double.parseDouble(value));
    }

    private static void initial(ModelDefinition.Builder builder, String name, String value) {
        builder.initialValue(name, Double.parseDouble(value));
    }
}
