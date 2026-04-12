plugins {
    java
    application
}

group = "io.github.joaomacalos"
version = "0.1.0-SNAPSHOT"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

repositories {
    mavenCentral()
}

application {
    mainClass.set("io.github.joaomacalos.sfcr.example.ExampleMain")
}

tasks.test {
    useJUnitPlatform()
}
