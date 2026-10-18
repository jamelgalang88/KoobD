# Platformer block images

Add the supplied image designs to this folder and set the matching `img` slot
in `../../../js/platformer-blocks.js` (`block1` through `block4`). Until an image
is supplied, each block type uses its own flat color from that configuration.
An image replaces the color fallback and collision is derived from its opaque
pixels; a color fallback uses its visible rectangular bounds for collision.

Gameplay derives collision from the image's opaque pixels. The complete image,
including its transparent areas, is displayed in the block's editor dimensions.
Do not add CSS artwork or a separate hand-authored collision silhouette.
