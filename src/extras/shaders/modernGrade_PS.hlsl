sampler2D tex : register(s0);
float4 texel : register(c10);	// xy: size of one source texel, z: screen aspect ratio
float4 bounds : register(c11);	// valid source texcoords: xy min, zw max
float4 screenScale : register(c12);	// xy: maps texcoord to 0..1 over the visible screen
float4 gradeParams : register(c13);	// x: sharpen, y: contrast, z: vibrance, w: vignette

float3 Fetch(float2 uv)
{
	return tex2D(tex, clamp(uv, bounds.xy, bounds.zw)).rgb;
}

float4 main(in float2 texcoord : TEXCOORD0) : COLOR0
{
	float2 uv = texcoord.xy;
	float2 px = texel.xy;
	float sharpen = gradeParams.x;
	float contrast = gradeParams.y;
	float vibrance = gradeParams.z;
	float vignette = gradeParams.w;

	// contrast adaptive sharpening: sharpen less where the neighbourhood
	// already has strong contrast so edges don't ring
	float3 c = Fetch(uv);
	float3 n = Fetch(uv + float2(0.0, -px.y));
	float3 s = Fetch(uv + float2(0.0,  px.y));
	float3 e = Fetch(uv + float2( px.x, 0.0));
	float3 w = Fetch(uv + float2(-px.x, 0.0));
	float3 mn = min(c, min(min(n, s), min(e, w)));
	float3 mx = max(c, max(max(n, s), max(e, w)));
	float3 amp = sqrt(saturate(min(mn, 1.0 - mx) / max(mx, 0.0001)));
	float3 wgt = -amp * (sharpen * 0.2);
	c = saturate((c + (n + s + e + w)*wgt) / (1.0 + 4.0*wgt));

	// filmic S-curve, keeps black and white where they are
	c = lerp(c, c*c*(3.0 - 2.0*c), contrast);

	// vibrance: saturate dull colours more than already saturated ones
	float luma = dot(c, float3(0.2126, 0.7152, 0.0722));
	float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
	c = saturate(lerp(luma.xxx, c, 1.0 + vibrance*(1.0 - sat)));

	// vignette, 1.0 in the corners regardless of aspect ratio
	float2 sc = texcoord.xy*screenScale.xy - 0.5;
	sc.x *= texel.z;
	float dist = length(sc) / length(float2(0.5*texel.z, 0.5));
	c *= 1.0 - vignette*smoothstep(0.45, 1.0, dist);

	float4 color;
	color.rgb = c;
	color.a = 1.0;
	return color;
}
