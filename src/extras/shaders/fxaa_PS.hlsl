sampler2D tex : register(s0);
float4 texel : register(c10);	// xy: size of one source texel
float4 bounds : register(c11);	// valid source texcoords: xy min, zw max

// FXAA (after Timothy Lottes), cheap variant: find the local edge
// direction from the luma of the four diagonal neighbours and blur along it.
#define FXAA_SPAN_MAX 8.0
#define FXAA_REDUCE_MUL (1.0/8.0)
#define FXAA_REDUCE_MIN (1.0/128.0)

float3 Fetch(float2 uv)
{
	return tex2D(tex, clamp(uv, bounds.xy, bounds.zw)).rgb;
}

float Luma(float3 c)
{
	return dot(c, float3(0.299, 0.587, 0.114));
}

float4 main(in float2 texcoord : TEXCOORD0) : COLOR0
{
	float2 uv = texcoord.xy;
	float2 px = texel.xy;

	float3 rgbNW = Fetch(uv + float2(-1.0, -1.0)*px);
	float3 rgbNE = Fetch(uv + float2( 1.0, -1.0)*px);
	float3 rgbSW = Fetch(uv + float2(-1.0,  1.0)*px);
	float3 rgbSE = Fetch(uv + float2( 1.0,  1.0)*px);
	float3 rgbM  = Fetch(uv);

	float lumaNW = Luma(rgbNW);
	float lumaNE = Luma(rgbNE);
	float lumaSW = Luma(rgbSW);
	float lumaSE = Luma(rgbSE);
	float lumaM  = Luma(rgbM);
	float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
	float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

	float2 dir;
	dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
	dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
	float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);
	float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);
	dir = clamp(dir*rcpDirMin, -FXAA_SPAN_MAX, FXAA_SPAN_MAX) * px;

	float3 rgbA = 0.5 * (Fetch(uv + dir*(1.0/3.0 - 0.5)) + Fetch(uv + dir*(2.0/3.0 - 0.5)));
	float3 rgbB = rgbA*0.5 + 0.25 * (Fetch(uv - dir*0.5) + Fetch(uv + dir*0.5));
	float lumaB = Luma(rgbB);

	float4 color;
	color.rgb = (lumaB < lumaMin || lumaB > lumaMax) ? rgbA : rgbB;
	color.a = 1.0;
	return color;
}
