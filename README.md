# Morphogen Atlas

Public static viewer for the reconstructed human fetal cortex.

## View

Open the GitHub Pages site:

`https://LJZYlinpr.github.io/morphogen-atlas/`

The page compares the same shared gene-shape module on three reconstructed fields:

- `AP`: posterior `0` to anterior `100`.
- `u`: left and right hemispheres are shown together; each side runs from the middle `0` toward its lateral side `100`.
- `w`: lateral `0` to medial `100`.

## Modules

The atlas contains eight shared shape modules (`M1`-`M8`). A module is a group of genes with a similar response shape along the reconstructed fields. The same gene membership is retained across AP, u, and w; modules are not re-clustered independently for each panel.

The trend text describes whether a module rises, falls, peaks in the middle, has a middle trough, or has a complex non-monotone profile. It is an exploratory tissue-expression description, not a cell-intrinsic mechanism or an independent-donor replication.

## Display

- Blue-white-red is centered at zero: blue is below the module baseline, white is zero, and red is above baseline.
- `Observed` shows real-voxel tissue scores.
- `Fitted` shows the one-dimensional profile projected back onto supported real voxels.
- `Gradient` shows the derivative of the fitted profile per field unit; it is not a measured three-dimensional physical gradient per millimeter.
- The gray cortex background provides anatomical context and is not part of module statistics or picking.
- The public bundle is a uniform subsample of the full real-voxel reconstruction and uses int16 scalar quantization for web delivery. Full-resolution analysis outputs remain outside this public static bundle.

## Provenance

The visualization is derived from one human fetal cortex specimen and 48 real serial sections. The left/right labels follow the current low-z/high-z convention and require anatomical verification before biological laterality claims. Expression is library-normalized tissue pseudobulk; interpolated layers are not treated as expression replicates.
