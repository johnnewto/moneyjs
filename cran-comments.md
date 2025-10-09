## Patch to previous release
This submission is a patch to fix a WARN and NOTE issued by CRAN, deadline on 2025-10-17.


## Test environments
* Local Windows 10 x64, R 4.5.1
* macOS-latest, R 4.5.1 (on github actions)
* windows-latest, R 4.5.1 (on github actions)
* ubuntu-latest (devel), R devel (on github actions)
* ubuntu-latest (release), R 4.5.1 (on github actions)
* ubuntu-latest (oldrel-1), R 4.4.3 (on github actions)

## R CMD check results (Local Ubuntu 20.04.1)
There were no ERRORs or WARNINGs or NOTEs.


## Existing CRAN checks issues:
This patch fixes the following WARN and NOTE:

Check: whether package can be installed
Result: WARN 
  Found the following significant warnings:
    /home/hornik/tmp/R.check/r-devel-clang/Work/build/Packages/RcppArmadillo/include/RcppArmadillo/version/arma.h:66:17: warning: Using fallback compilation with Armadillo 14.6.3. Please consider defining -DARMA_USE_CURRENT and also removing C++11 compilation directive. See GitHub issue #475 for more. [-W#pragma-messages]
  See ‘/home/hornik/tmp/R.check/r-devel-clang/Work/PKGS/sfcr.Rcheck/00install.out’ for details.
  * used C++ compiler: ‘Debian clang version 19.1.7 (7)’
Flavor: r-devel-linux-x86_64-debian-clang

Version: 0.2.1
Check: C++ specification
Result: NOTE 
    Specified C++11: please drop specification unless essential
Flavors: r-devel-linux-x86_64-debian-clang, r-devel-linux-x86_64-debian-gcc, r-devel-linux-x86_64-fedora-clang, r-devel-linux-x86_64-fedora-gcc, r-devel-windows-x86_64, r-patched-linux-x86_64, r-release-linux-x86_64, r-release-macos-arm64, r-release-macos-x86_64, r-release-windows-x86_64, r-oldrel-macos-arm64, r-oldrel-macos-x86_64, r-oldrel-windows-x86_64
  

To fix the issue, the obsolete `CXX_STD = CXX11` line was removed from the src/Makevars file.
