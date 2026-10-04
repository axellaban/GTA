uniform sampler2D tex0;
uniform vec4 u_texel;	// xy: size of one source texel
uniform vec4 u_bounds;	// valid source texcoords: xy min, zw max
uniform vec4 u_bloomParams;	// x: threshold, y: soft knee

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

	// 4 bilinear taps average a 4x4 block of the full resolution image
	vec3 c = Fetch(uv + vec2(-1.0, -1.0)*px);
	c += Fetch(uv + vec2( 1.0, -1.0)*px);
	c += Fetch(uv + vec2(-1.0,  1.0)*px);
	c += Fetch(uv + vec2( 1.0,  1.0)*px);
	c *= 0.25;

	// bright pass with a soft knee so lights fade in instead of popping
	float threshold = u_bloomParams.x;
	float knee = u_bloomParams.y;
	float brightness = max(c.r, max(c.g, c.b));
	float soft = clamp(brightness - threshold + knee, 0.0, 2.0*knee);
	soft = soft*soft / (4.0*knee + 0.00001);
	float contribution = max(soft, brightness - threshold) / max(brightness, 0.00001);

	vec4 color;
	color.rgb = c*contribution;
	color.a = 1.0;

	FRAGCOLOR(color);
}
