uniform sampler2D tex0;
uniform vec4 u_blurDir;	// xy: distance between taps in texcoords

FSIN vec4 v_color;
FSIN vec2 v_tex0;
FSIN float v_fog;

// 9 tap gaussian done with 5 bilinear fetches
void
main(void)
{
	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);
	vec2 d = u_blurDir.xy;

	vec3 c = texture(tex0, uv).rgb * 0.2270270270;
	c += (texture(tex0, uv + d*1.3846153846).rgb + texture(tex0, uv - d*1.3846153846).rgb) * 0.3162162162;
	c += (texture(tex0, uv + d*3.2307692308).rgb + texture(tex0, uv - d*3.2307692308).rgb) * 0.0702702703;

	vec4 color;
	color.rgb = c;
	color.a = 1.0;

	FRAGCOLOR(color);
}
