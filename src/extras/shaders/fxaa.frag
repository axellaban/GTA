uniform sampler2D tex0;
uniform vec4 u_texel;	// xy: size of one source texel
uniform vec4 u_bounds;	// valid source texcoords: xy min, zw max

FSIN vec4 v_color;
FSIN vec2 v_tex0;
FSIN float v_fog;

// FXAA (after Timothy Lottes), cheap variant: find the local edge
// direction from the luma of the four diagonal neighbours and blur along it.
#define FXAA_SPAN_MAX 8.0
#define FXAA_REDUCE_MUL (1.0/8.0)
#define FXAA_REDUCE_MIN (1.0/128.0)

vec3
Fetch(vec2 uv)
{
	return texture(tex0, clamp(uv, u_bounds.xy, u_bounds.zw)).rgb;
}

float
Luma(vec3 c)
{
	return dot(c, vec3(0.299, 0.587, 0.114));
}

void
main(void)
{
	vec2 uv = vec2(v_tex0.x, 1.0-v_tex0.y);
	vec2 px = u_texel.xy;

	vec3 rgbNW = Fetch(uv + vec2(-1.0, -1.0)*px);
	vec3 rgbNE = Fetch(uv + vec2( 1.0, -1.0)*px);
	vec3 rgbSW = Fetch(uv + vec2(-1.0,  1.0)*px);
	vec3 rgbSE = Fetch(uv + vec2( 1.0,  1.0)*px);
	vec3 rgbM  = Fetch(uv);

	float lumaNW = Luma(rgbNW);
	float lumaNE = Luma(rgbNE);
	float lumaSW = Luma(rgbSW);
	float lumaSE = Luma(rgbSE);
	float lumaM  = Luma(rgbM);
	float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
	float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

	vec2 dir;
	dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
	dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
	float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
	float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);
	dir = clamp(dir*rcpDirMin, vec2(-FXAA_SPAN_MAX), vec2(FXAA_SPAN_MAX)) * px;

	vec3 rgbA = 0.5 * (Fetch(uv + dir*(1.0/3.0 - 0.5)) + Fetch(uv + dir*(2.0/3.0 - 0.5)));
	vec3 rgbB = rgbA*0.5 + 0.25 * (Fetch(uv - dir*0.5) + Fetch(uv + dir*0.5));
	float lumaB = Luma(rgbB);

	vec4 color;
	color.rgb = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
	color.a = 1.0;

	FRAGCOLOR(color);
}
