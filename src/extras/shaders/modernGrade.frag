uniform sampler2D tex0;
uniform vec4 u_texel;	// xy: size of one source texel, z: screen aspect ratio
uniform vec4 u_bounds;	// valid source texcoords: xy min, zw max
uniform vec4 u_screenScale;	// xy: maps v_tex0 to 0..1 over the visible screen
uniform vec4 u_gradeParams;	// x: sharpen, y: contrast, z: vibrance, w: vignette

FSIN vec4 v_color;
FSIN vec2 v_tex0;
FSIN float v_fog;

vec3
Fetch(vec2 uv)
{
	return texture(tex0, clamp(uv, u_bounds.xy, u_bounds.zw)).rgb;
}

void
main(void)
{
	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);
	vec2 px = u_texel.xy;
	float sharpen = u_gradeParams.x;
	float contrast = u_gradeParams.y;
	float vibrance = u_gradeParams.z;
	float vignette = u_gradeParams.w;

	// contrast adaptive sharpening: sharpen less where the neighbourhood
	// already has strong contrast so edges don't ring
	vec3 c = Fetch(uv);
	vec3 n = Fetch(uv + vec2(0.0, -px.y));
	vec3 s = Fetch(uv + vec2(0.0,  px.y));
	vec3 e = Fetch(uv + vec2( px.x, 0.0));
	vec3 w = Fetch(uv + vec2(-px.x, 0.0));
	vec3 mn = min(c, min(min(n, s), min(e, w)));
	vec3 mx = max(c, max(max(n, s), max(e, w)));
	vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, vec3(0.0001)), 0.0, 1.0));
	vec3 wgt = -amp * (sharpen * 0.2);
	c = clamp((c + (n + s + e + w)*wgt) / (1.0 + 4.0*wgt), 0.0, 1.0);

	// filmic S-curve, keeps black and white where they are
	c = mix(c, c*c*(3.0 - 2.0*c), contrast);

	// vibrance: saturate dull colours more than already saturated ones
	float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
	float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
	c = clamp(mix(vec3(luma), c, 1.0 + vibrance*(1.0 - sat)), 0.0, 1.0);

	// vignette, 1.0 in the corners regardless of aspect ratio
	vec2 sc = v_tex0*u_screenScale.xy - 0.5;
	sc.x *= u_texel.z;
	float dist = length(sc) / length(vec2(0.5*u_texel.z, 0.5));
	c *= 1.0 - vignette*smoothstep(0.45, 1.0, dist);

	vec4 color;
	color.rgb = c;
	color.a = 1.0;

	FRAGCOLOR(color);
}
