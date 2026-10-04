#define WITHD3D
#include "common.h"

#ifdef EXTENDED_COLOURFILTER

#ifndef LIBRW
#error "Need librw for EXTENDED_COLOURFILTER"
#endif

#include "main.h"
#include "RwHelper.h"
#include "Camera.h"
#include "MBlur.h"
#include "postfx.h"

RwRaster *CPostFX::pFrontBuffer;
RwRaster *CPostFX::pBackBuffer;
bool CPostFX::bJustInitialised;
int CPostFX::EffectSwitch = POSTFX_NORMAL;
bool CPostFX::BlurOn = false;
bool CPostFX::MotionBlurOn = false;

static RwIm2DVertex Vertex[4];
static RwIm2DVertex Vertex2[4];
static RwImVertexIndex Index[6] = { 0, 1, 2, 0, 2, 3 };

#ifdef RW_D3D9
void *colourfilterVC_PS;
void *contrast_PS;
#endif
#ifdef RW_OPENGL
int32 u_blurcolor;
int32 u_contrastAdd;
int32 u_contrastMult;
rw::gl3::Shader *colourFilterVC;
rw::gl3::Shader *contrast;
#endif

#ifdef MODERN_POSTFX
int8 CPostFX::ModernFXPreset = CPostFX::MODERNFX_SUBTLE;
bool CPostFX::FxaaOn = true;
float CPostFX::Sharpen = 0.5f;
float CPostFX::BloomIntensity = 0.35f;
float CPostFX::BloomThreshold = 0.7f;
float CPostFX::Contrast = 0.15f;
float CPostFX::Vibrance = 0.2f;
float CPostFX::Vignette = 0.25f;

struct ModernFXSettings
{
	float sharpen;
	float bloomIntensity;
	float bloomThreshold;
	float contrast;
	float vibrance;
	float vignette;
};

static const ModernFXSettings ModernFXPresets[] = {
	// sharpen bloom  threshold contrast vibrance vignette
	{ 0.0f,    0.0f,  1.0f,     0.0f,    0.0f,    0.0f },	// MODERNFX_OFF
	{ 0.5f,    0.35f, 0.7f,     0.15f,   0.2f,    0.25f },	// MODERNFX_SUBTLE
	{ 0.7f,    0.6f,  0.6f,     0.25f,   0.35f,   0.35f },	// MODERNFX_VIVID
};

enum {
	MODERNFX_SHADER_FXAA,
	MODERNFX_SHADER_BLOOMEXTRACT,
	MODERNFX_SHADER_BLOOMBLUR,
	MODERNFX_SHADER_GRADE,
	NUM_MODERNFX_SHADERS
};

// bloom is rendered at a quarter of the screen resolution, ping-ponging between two rasters
static RwRaster *pBloomRaster[2];
static RwRaster *pBloomZRaster;
static RwCamera *pBloomCam;

#ifdef RW_D3D9
static void *modernFX_PS[NUM_MODERNFX_SHADERS];
#endif
#ifdef RW_OPENGL
static int32 u_texel;
static int32 u_bounds;
static int32 u_bloomParams;
static int32 u_blurDir;
static int32 u_screenScale;
static int32 u_gradeParams;
static rw::gl3::Shader *modernFX[NUM_MODERNFX_SHADERS];
#endif
#endif

void
CPostFX::InitOnce(void)
{
#ifdef RW_OPENGL
	u_blurcolor = rw::gl3::registerUniform("u_blurcolor");
	u_contrastAdd = rw::gl3::registerUniform("u_contrastAdd");
	u_contrastMult = rw::gl3::registerUniform("u_contrastMult");
#ifdef MODERN_POSTFX
	u_texel = rw::gl3::registerUniform("u_texel");
	u_bounds = rw::gl3::registerUniform("u_bounds");
	u_bloomParams = rw::gl3::registerUniform("u_bloomParams");
	u_blurDir = rw::gl3::registerUniform("u_blurDir");
	u_screenScale = rw::gl3::registerUniform("u_screenScale");
	u_gradeParams = rw::gl3::registerUniform("u_gradeParams");
#endif
#endif
}

void
CPostFX::Open(RwCamera *cam)
{
	uint32 width  = Pow(2.0f, int32(log2(RwRasterGetWidth (RwCameraGetRaster(cam))))+1);
	uint32 height = Pow(2.0f, int32(log2(RwRasterGetHeight(RwCameraGetRaster(cam))))+1);
	uint32 depth  = RwRasterGetDepth(RwCameraGetRaster(cam));
	pFrontBuffer = RwRasterCreate(width, height, depth, rwRASTERTYPECAMERATEXTURE);
	pBackBuffer = RwRasterCreate(width, height, depth, rwRASTERTYPECAMERATEXTURE);
	bJustInitialised = true;

	float zero, xmax, ymax;

	if(RwRasterGetDepth(RwCameraGetRaster(cam)) == 16){
		zero = HALFPX;
		xmax = width + HALFPX;
		ymax = height + HALFPX;
	}else{
		zero = -HALFPX;
		xmax = width - HALFPX;
		ymax = height - HALFPX;
	}

	RwIm2DVertexSetScreenX(&Vertex[0], zero);
	RwIm2DVertexSetScreenY(&Vertex[0], zero);
	RwIm2DVertexSetScreenZ(&Vertex[0], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex[0], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex[0], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex[0], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex[0], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex[0], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex[1], zero);
	RwIm2DVertexSetScreenY(&Vertex[1], ymax);
	RwIm2DVertexSetScreenZ(&Vertex[1], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex[1], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex[1], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex[1], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex[1], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex[1], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex[2], xmax);
	RwIm2DVertexSetScreenY(&Vertex[2], ymax);
	RwIm2DVertexSetScreenZ(&Vertex[2], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex[2], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex[2], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex[2], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex[2], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex[2], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex[3], xmax);
	RwIm2DVertexSetScreenY(&Vertex[3], zero);
	RwIm2DVertexSetScreenZ(&Vertex[3], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex[3], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex[3], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex[3], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex[3], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex[3], 255, 255, 255, 255);


	RwIm2DVertexSetScreenX(&Vertex2[0], zero + 2.0f);
	RwIm2DVertexSetScreenY(&Vertex2[0], zero + 2.0f);
	RwIm2DVertexSetScreenZ(&Vertex2[0], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex2[0], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex2[0], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex2[0], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex2[0], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex2[0], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex2[1], 2.0f);
	RwIm2DVertexSetScreenY(&Vertex2[1], ymax + 2.0f);
	RwIm2DVertexSetScreenZ(&Vertex2[1], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex2[1], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex2[1], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex2[1], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex2[1], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex2[1], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex2[2], xmax + 2.0f);
	RwIm2DVertexSetScreenY(&Vertex2[2], ymax + 2.0f);
	RwIm2DVertexSetScreenZ(&Vertex2[2], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex2[2], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex2[2], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex2[2], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex2[2], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex2[2], 255, 255, 255, 255);

	RwIm2DVertexSetScreenX(&Vertex2[3], xmax + 2.0f);
	RwIm2DVertexSetScreenY(&Vertex2[3], zero + 2.0f);
	RwIm2DVertexSetScreenZ(&Vertex2[3], RwIm2DGetNearScreenZ());
	RwIm2DVertexSetCameraZ(&Vertex2[3], RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetRecipCameraZ(&Vertex2[3], 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetU(&Vertex2[3], 1.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetV(&Vertex2[3], 0.0f, 1.0f/RwCameraGetNearClipPlane(cam));
	RwIm2DVertexSetIntRGBA(&Vertex2[3], 255, 255, 255, 255);


#ifdef RW_D3D9
#include "shaders/obj/colourfilterVC_PS.inc"
	colourfilterVC_PS = rw::d3d::createPixelShader(colourfilterVC_PS_cso);
#include "shaders/obj/contrastPS.inc"
	contrast_PS = rw::d3d::createPixelShader(contrastPS_cso);
#ifdef MODERN_POSTFX
#include "shaders/obj/fxaa_PS.inc"
	modernFX_PS[MODERNFX_SHADER_FXAA] = rw::d3d::createPixelShader(fxaa_PS_cso);
#include "shaders/obj/bloomExtract_PS.inc"
	modernFX_PS[MODERNFX_SHADER_BLOOMEXTRACT] = rw::d3d::createPixelShader(bloomExtract_PS_cso);
#include "shaders/obj/bloomBlur_PS.inc"
	modernFX_PS[MODERNFX_SHADER_BLOOMBLUR] = rw::d3d::createPixelShader(bloomBlur_PS_cso);
#include "shaders/obj/modernGrade_PS.inc"
	modernFX_PS[MODERNFX_SHADER_GRADE] = rw::d3d::createPixelShader(modernGrade_PS_cso);
#endif
#endif
#ifdef RW_OPENGL
	using namespace rw::gl3;

	{
#include "shaders/obj/im2d_vert.inc"
#include "shaders/obj/colourfilterVC_frag.inc"
	const char *vs[] = { shaderDecl, header_vert_src, im2d_vert_src, nil };
	const char *fs[] = { shaderDecl, header_frag_src, colourfilterVC_frag_src, nil };
	colourFilterVC = Shader::create(vs, fs);
	assert(colourFilterVC);
	}

	{
#include "shaders/obj/im2d_vert.inc"
#include "shaders/obj/contrast_frag.inc"
	const char *vs[] = { shaderDecl, header_vert_src, im2d_vert_src, nil };
	const char *fs[] = { shaderDecl, header_frag_src, contrast_frag_src, nil };
	contrast = Shader::create(vs, fs);
	assert(contrast);
	}

#ifdef MODERN_POSTFX
	{
#include "shaders/obj/im2d_vert.inc"
#include "shaders/obj/fxaa_frag.inc"
#include "shaders/obj/bloomExtract_frag.inc"
#include "shaders/obj/bloomBlur_frag.inc"
#include "shaders/obj/modernGrade_frag.inc"
	const char *fragSrc[NUM_MODERNFX_SHADERS] = { fxaa_frag_src, bloomExtract_frag_src, bloomBlur_frag_src, modernGrade_frag_src };
	for(int i = 0; i < NUM_MODERNFX_SHADERS; i++){
		const char *vs[] = { shaderDecl, header_vert_src, im2d_vert_src, nil };
		const char *fs[] = { shaderDecl, header_frag_src, fragSrc[i], nil };
		modernFX[i] = Shader::create(vs, fs);
		assert(modernFX[i]);
	}
	}
#endif

#endif
}

#ifdef MODERN_POSTFX
static void
DestroyBloomBuffers(void)
{
	if(pBloomCam){
		RwFrame *frame = RwCameraGetFrame(pBloomCam);
		RwCameraSetFrame(pBloomCam, nil);
		if(frame)
			RwFrameDestroy(frame);
		RwCameraDestroy(pBloomCam);
		pBloomCam = nil;
	}
	for(int i = 0; i < 2; i++)
		if(pBloomRaster[i]){
			RwRasterDestroy(pBloomRaster[i]);
			pBloomRaster[i] = nil;
		}
	if(pBloomZRaster){
		RwRasterDestroy(pBloomZRaster);
		pBloomZRaster = nil;
	}
}
#endif

void
CPostFX::Close(void)
{
	if(pFrontBuffer){
		RwRasterDestroy(pFrontBuffer);
		pFrontBuffer = nil;
	}
	if(pBackBuffer){
		RwRasterDestroy(pBackBuffer);
		pBackBuffer = nil;
	}
#ifdef MODERN_POSTFX
	DestroyBloomBuffers();
	for(int i = 0; i < NUM_MODERNFX_SHADERS; i++){
#ifdef RW_D3D9
		if(modernFX_PS[i]){
			rw::d3d::destroyPixelShader(modernFX_PS[i]);
			modernFX_PS[i] = nil;
		}
#endif
#ifdef RW_OPENGL
		if(modernFX[i]){
			modernFX[i]->destroy();
			modernFX[i] = nil;
		}
#endif
	}
#endif
#ifdef RW_D3D9
	if(colourfilterVC_PS){
		rw::d3d::destroyPixelShader(colourfilterVC_PS);
		colourfilterVC_PS = nil;
	}
	if(contrast_PS){
		rw::d3d::destroyPixelShader(contrast_PS);
		contrast_PS = nil;
	}
#endif
#ifdef RW_OPENGL
	if(colourFilterVC){
		colourFilterVC->destroy();
		colourFilterVC = nil;
	}
	if(contrast){
		contrast->destroy();
		contrast = nil;
	}
#endif
}

void
CPostFX::RenderOverlayBlur(RwCamera *cam, int32 r, int32 g, int32 b, int32 a)
{
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pFrontBuffer);
	RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)TRUE);

	RwIm2DVertexSetIntRGBA(&Vertex[0], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex[1], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex[2], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex[3], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex2[0], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex2[1], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex2[2], r*2, g*2, b*2, 30);
	RwIm2DVertexSetIntRGBA(&Vertex2[3], r*2, g*2, b*2, 30);

	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDSRCALPHA);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDINVSRCALPHA);

	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, BlurOn ? Vertex2 : Vertex, 4, Index, 6);


	RwIm2DVertexSetIntRGBA(&Vertex2[0], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex[0], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex2[1], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex[1], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex2[2], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex[2], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex2[3], r, g, b, a);
	RwIm2DVertexSetIntRGBA(&Vertex[3], r, g, b, a);

	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDONE);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDONE);

	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, Vertex, 4, Index, 6);
	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, BlurOn ? Vertex2 : Vertex, 4, Index, 6);
}

void
CPostFX::RenderOverlaySniper(RwCamera *cam, int32 r, int32 g, int32 b, int32 a)
{
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pFrontBuffer);
	RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)TRUE);

	RwIm2DVertexSetIntRGBA(&Vertex[0], r, g, b, 80);
	RwIm2DVertexSetIntRGBA(&Vertex[1], r, g, b, 80);
	RwIm2DVertexSetIntRGBA(&Vertex[2], r, g, b, 80);
	RwIm2DVertexSetIntRGBA(&Vertex[3], r, g, b, 80);
	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDSRCALPHA);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDINVSRCALPHA);

	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, Vertex, 4, Index, 6);
}

float CPostFX::Intensity = 1.0f;

void
CPostFX::RenderOverlayShader(RwCamera *cam, int32 r, int32 g, int32 b, int32 a)
{
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pBackBuffer);

	if(EffectSwitch == POSTFX_MOBILE){
		float mult[3], add[3];
		mult[0] = (r-64)/256.0f + 1.4f;
		mult[1] = (g-64)/256.0f + 1.4f;
		mult[2] = (b-64)/256.0f + 1.4f;
		add[0] = r/1536.f - 0.05f;
		add[1] = g/1536.f - 0.05f;
		add[2] = b/1536.f - 0.05f;
#ifdef RW_D3D9
		rw::d3d::d3ddevice->SetPixelShaderConstantF(10, mult, 1);
		rw::d3d::d3ddevice->SetPixelShaderConstantF(11, add, 1);

		rw::d3d::im2dOverridePS = contrast_PS;
#endif
#ifdef RW_OPENGL
		rw::gl3::im2dOverrideShader = contrast;
		contrast->use();
		glUniform3fv(contrast->uniformLocations[u_contrastMult], 1, mult);
		glUniform3fv(contrast->uniformLocations[u_contrastAdd], 1, add);
#endif
	}else{
		float f = Intensity;
		float blurcolors[4];
		blurcolors[0] = r*f/255.0f;
		blurcolors[1] = g*f/255.0f;
		blurcolors[2] = b*f/255.0f;
		blurcolors[3] = 30/255.0f;
#ifdef RW_D3D9
		rw::d3d::d3ddevice->SetPixelShaderConstantF(10, blurcolors, 1);
		rw::d3d::im2dOverridePS = colourfilterVC_PS;
#endif
#ifdef RW_OPENGL
		rw::gl3::im2dOverrideShader = colourFilterVC;
		colourFilterVC->use();
		glUniform4fv(colourFilterVC->uniformLocations[u_blurcolor], 1, blurcolors);
#endif
	}
	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, Vertex, 4, Index, 6);
#ifdef RW_D3D9
	rw::d3d::im2dOverridePS = nil;
#endif
#ifdef RW_OPENGL
	rw::gl3::im2dOverrideShader = nil;
#endif
}

void
CPostFX::RenderMotionBlur(RwCamera *cam, uint32 blur)
{
	if(blur == 0)
		return;

	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pFrontBuffer);
	RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)TRUE);
	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDSRCALPHA);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDINVSRCALPHA);

	RwIm2DVertexSetIntRGBA(&Vertex[0], 255, 255, 255, blur);
	RwIm2DVertexSetIntRGBA(&Vertex[1], 255, 255, 255, blur);
	RwIm2DVertexSetIntRGBA(&Vertex[2], 255, 255, 255, blur);
	RwIm2DVertexSetIntRGBA(&Vertex[3], 255, 255, 255, blur);

	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, Vertex, 4, Index, 6);
}

bool
CPostFX::NeedBackBuffer(void)
{
	// Current frame -- needed for non-blur effect
	switch(EffectSwitch){
	case POSTFX_OFF:
	case POSTFX_SIMPLE:
		// no actual rendering here
		return false;
	case POSTFX_NORMAL:
		if(MotionBlurOn)
			return false;
		else
			return true;
	case POSTFX_MOBILE:
		return true;
	}
	return false;
}

bool
CPostFX::NeedFrontBuffer(int32 type)
{
	// Last frame -- needed for motion blur
	if(CMBlur::Drunkness > 0.0f)
		return true;
	if(type == MOTION_BLUR_SNIPER)
		return true;

	switch(EffectSwitch){
	case POSTFX_OFF:
	case POSTFX_SIMPLE:
		// no actual rendering here
		return false;
	case POSTFX_NORMAL:
		if(MotionBlurOn)
			return true;
		else
			return false;
	case POSTFX_MOBILE:
		return false;
	}
	return false;
}

void
CPostFX::GetBackBuffer(RwCamera *cam)
{
	RwRasterPushContext(pBackBuffer);
	RwRasterRenderFast(RwCameraGetRaster(cam), 0, 0);
	RwRasterPopContext();
}

void
CPostFX::Render(RwCamera *cam, uint32 red, uint32 green, uint32 blue, uint32 blur, int32 type, uint32 bluralpha)
{
	PUSH_RENDERGROUP("CPostFX::Render");

	if(pFrontBuffer == nil)
		Open(cam);
	assert(pFrontBuffer);
	assert(pBackBuffer);

	if(type == MOTION_BLUR_LIGHT_SCENE){
		SmoothColor(red, green, blue, blur);
		red = AvgRed;
		green = AvgGreen;
		blue = AvgBlue;
		blur = AvgAlpha;
	}

	if(NeedBackBuffer())
		GetBackBuffer(cam);

	DefinedState();

	RwRenderStateSet(rwRENDERSTATEFOGENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATETEXTUREFILTER, (void*)rwFILTERNEAREST);
	RwRenderStateSet(rwRENDERSTATEZTESTENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATEZWRITEENABLE, (void*)FALSE);

	if(type == MOTION_BLUR_SNIPER){
		if(!bJustInitialised)
			RenderOverlaySniper(cam, red, green, blue, blur);
	}else switch(EffectSwitch){
	case POSTFX_OFF:
	case POSTFX_SIMPLE:
		// no actual rendering here
		break;
	case POSTFX_NORMAL:
		if(MotionBlurOn){
			if(!bJustInitialised)
				RenderOverlayBlur(cam, red, green, blue, blur);
		}else{
			RenderOverlayShader(cam, red, green, blue, blur);
		}
		break;
	case POSTFX_MOBILE:
		RenderOverlayShader(cam, red, green, blue, blur);
		break;
	}

	if(!bJustInitialised)
		RenderMotionBlur(cam, 175.0f * CMBlur::Drunkness);

	RwRenderStateSet(rwRENDERSTATEZTESTENABLE, (void*)TRUE);
	RwRenderStateSet(rwRENDERSTATEZWRITEENABLE, (void*)TRUE);
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, nil);
	RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDSRCALPHA);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDINVSRCALPHA);

	if(NeedFrontBuffer(type)){
		RwRasterPushContext(pFrontBuffer);
		RwRasterRenderFast(RwCameraGetRaster(cam), 0, 0);
		RwRasterPopContext();
		bJustInitialised = false;
	}else
		bJustInitialised = true;

	POP_RENDERGROUP();
}

#ifdef MODERN_POSTFX

static ModernFXSettings
GetModernFXSettings(void)
{
	if(CPostFX::ModernFXPreset == CPostFX::MODERNFX_CUSTOM){
		ModernFXSettings s = { CPostFX::Sharpen, CPostFX::BloomIntensity, CPostFX::BloomThreshold,
			CPostFX::Contrast, CPostFX::Vibrance, CPostFX::Vignette };
		return s;
	}
	return ModernFXPresets[clamp((int)CPostFX::ModernFXPreset, (int)CPostFX::MODERNFX_OFF, (int)CPostFX::MODERNFX_VIVID)];
}

static void
SetQuad(RwIm2DVertex *verts, RwCamera *cam, float width, float height, float umax, float vmax, uint8 intensity)
{
	float nearz = RwCameraGetNearClipPlane(cam);
	float recipz = 1.0f/nearz;
	float x[4] = { 0.0f, 0.0f, width, width };
	float y[4] = { 0.0f, height, height, 0.0f };
	float u[4] = { 0.0f, 0.0f, umax, umax };
	float v[4] = { 0.0f, vmax, vmax, 0.0f };
	for(int i = 0; i < 4; i++){
		RwIm2DVertexSetScreenX(&verts[i], x[i] - HALFPX);
		RwIm2DVertexSetScreenY(&verts[i], y[i] - HALFPX);
		RwIm2DVertexSetScreenZ(&verts[i], RwIm2DGetNearScreenZ());
		RwIm2DVertexSetCameraZ(&verts[i], nearz);
		RwIm2DVertexSetRecipCameraZ(&verts[i], recipz);
		RwIm2DVertexSetU(&verts[i], u[i], recipz);
		RwIm2DVertexSetV(&verts[i], v[i], recipz);
		RwIm2DVertexSetIntRGBA(&verts[i], intensity, intensity, intensity, 255);
	}
}

// params are copied to c10.. for D3D and to the shader's uniforms (in the order they're declared) for GL
static void
RenderQuadWithShader(int shader, RwIm2DVertex *verts, float (*params)[4], int numParams)
{
#ifdef RW_D3D9
	rw::d3d::d3ddevice->SetPixelShaderConstantF(10, params[0], numParams);
	rw::d3d::im2dOverridePS = modernFX_PS[shader];
#endif
#ifdef RW_OPENGL
	static const int32 *uniforms[NUM_MODERNFX_SHADERS][4] = {
		{ &u_texel, &u_bounds, nil, nil },
		{ &u_texel, &u_bounds, &u_bloomParams, nil },
		{ &u_blurDir, nil, nil, nil },
		{ &u_texel, &u_bounds, &u_screenScale, &u_gradeParams }
	};
	rw::gl3::im2dOverrideShader = modernFX[shader];
	modernFX[shader]->use();
	for(int i = 0; i < numParams; i++)
		glUniform4fv(modernFX[shader]->uniformLocations[*uniforms[shader][i]], 1, params[i]);
#endif
	RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, verts, 4, Index, 6);
#ifdef RW_D3D9
	rw::d3d::im2dOverridePS = nil;
#endif
#ifdef RW_OPENGL
	rw::gl3::im2dOverrideShader = nil;
#endif
}

static bool
CreateBloomBuffers(RwCamera *cam)
{
	int32 width = Max(RwRasterGetWidth(RwCameraGetRaster(cam))/4, 1);
	int32 height = Max(RwRasterGetHeight(RwCameraGetRaster(cam))/4, 1);
	if(pBloomCam && RwRasterGetWidth(pBloomRaster[0]) == width && RwRasterGetHeight(pBloomRaster[0]) == height)
		return true;

	DestroyBloomBuffers();
	int32 depth = RwRasterGetDepth(RwCameraGetRaster(cam));
	pBloomRaster[0] = RwRasterCreate(width, height, depth, rwRASTERTYPECAMERATEXTURE);
	pBloomRaster[1] = RwRasterCreate(width, height, depth, rwRASTERTYPECAMERATEXTURE);
	pBloomZRaster = RwRasterCreate(width, height, 0, rwRASTERTYPEZBUFFER);
	pBloomCam = RwCameraCreate();
	RwFrame *frame = RwFrameCreate();
	if(pBloomRaster[0] == nil || pBloomRaster[1] == nil || pBloomZRaster == nil || pBloomCam == nil || frame == nil){
		if(frame)
			RwFrameDestroy(frame);
		DestroyBloomBuffers();
		return false;
	}
	RwCameraSetFrame(pBloomCam, frame);
	RwCameraSetRaster(pBloomCam, pBloomRaster[0]);
	RwCameraSetZRaster(pBloomCam, pBloomZRaster);
	RwCameraSetNearClipPlane(pBloomCam, RwCameraGetNearClipPlane(cam));
	return true;
}

// Renders the blurred bright parts of pBackBuffer into pBloomRaster[0].
// Has to leave the scene camera to render into the bloom rasters.
static void
RenderBloom(RwCamera *cam, const ModernFXSettings &settings, float (*backBufferParams)[4])
{
	float width = RwRasterGetWidth(pBloomRaster[0]);
	float height = RwRasterGetHeight(pBloomRaster[0]);
	float backWidth = RwRasterGetWidth(CPostFX::pBackBuffer);
	float backHeight = RwRasterGetHeight(CPostFX::pBackBuffer);
	float screenWidth = RwRasterGetWidth(RwCameraGetRaster(cam));
	float screenHeight = RwRasterGetHeight(RwCameraGetRaster(cam));
	RwIm2DVertex verts[4];
	float params[3][4];

	RwCameraEndUpdate(cam);

	// bright pass and downsample: back buffer -> bloom 0
	RwCameraSetRaster(pBloomCam, pBloomRaster[0]);
	RwCameraBeginUpdate(pBloomCam);
	SetQuad(verts, pBloomCam, width, height, screenWidth/backWidth, screenHeight/backHeight, 255);
	memcpy(params, backBufferParams, 2*sizeof(params[0]));
	params[2][0] = settings.bloomThreshold;
	params[2][1] = 0.1f;	// soft knee
	params[2][2] = 0.0f;
	params[2][3] = 0.0f;
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, CPostFX::pBackBuffer);
	RenderQuadWithShader(MODERNFX_SHADER_BLOOMEXTRACT, verts, params, 3);
	RwCameraEndUpdate(pBloomCam);

	// separable gaussian blur, getting wider with each iteration
	SetQuad(verts, pBloomCam, width, height, 1.0f, 1.0f, 255);
	for(int i = 1; i <= 3; i++){
		for(int pass = 0; pass < 2; pass++){
			RwCameraSetRaster(pBloomCam, pBloomRaster[1-pass]);
			RwCameraBeginUpdate(pBloomCam);
			params[0][0] = pass == 0 ? i/width : 0.0f;
			params[0][1] = pass == 0 ? 0.0f : i/height;
			params[0][2] = 0.0f;
			params[0][3] = 0.0f;
			RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pBloomRaster[pass]);
			RenderQuadWithShader(MODERNFX_SHADER_BLOOMBLUR, verts, params, 1);
			RwCameraEndUpdate(pBloomCam);
		}
	}

	RwCameraBeginUpdate(cam);
}

void
CPostFX::RenderModern(RwCamera *cam)
{
	// MODERNFX_OFF is the original look, FXAA included
	if(ModernFXPreset == MODERNFX_OFF)
		return;
	ModernFXSettings settings = GetModernFXSettings();
	bool doBloom = settings.bloomIntensity > 0.0f;
	bool doGrade = settings.sharpen > 0.0f || settings.contrast != 0.0f || settings.vibrance != 0.0f || settings.vignette > 0.0f;
	if(!FxaaOn && !doBloom && !doGrade)
		return;

	if(pBackBuffer == nil)
		Open(cam);
	if(doBloom && !CreateBloomBuffers(cam))
		doBloom = false;

	PUSH_RENDERGROUP("CPostFX::RenderModern");

	float backWidth = RwRasterGetWidth(pBackBuffer);
	float backHeight = RwRasterGetHeight(pBackBuffer);
	float screenWidth = RwRasterGetWidth(RwCameraGetRaster(cam));
	float screenHeight = RwRasterGetHeight(RwCameraGetRaster(cam));
	RwIm2DVertex verts[4];
	float params[4][4];

	// c10/u_texel: texel size and aspect ratio
	params[0][0] = 1.0f/backWidth;
	params[0][1] = 1.0f/backHeight;
	params[0][2] = screenWidth/screenHeight;
	params[0][3] = 0.0f;
	// c11/u_bounds: the part of the back buffer that has the screen in it, half a texel inside
	params[1][0] = 0.5f/backWidth;
	params[1][2] = (screenWidth-0.5f)/backWidth;
#ifdef RW_OPENGL
	// GL copies the screen to the top of the raster and flips the texcoords
	params[1][1] = 1.0f - (screenHeight-0.5f)/backHeight;
	params[1][3] = 1.0f - 0.5f/backHeight;
#else
	params[1][1] = 0.5f/backHeight;
	params[1][3] = (screenHeight-0.5f)/backHeight;
#endif

	GetBackBuffer(cam);

	DefinedState();
	RwRenderStateSet(rwRENDERSTATEFOGENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATETEXTUREFILTER, (void*)rwFILTERLINEAR);
	RwRenderStateSet(rwRENDERSTATETEXTUREADDRESS, (void*)rwTEXTUREADDRESSCLAMP);
	RwRenderStateSet(rwRENDERSTATEZTESTENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATEZWRITEENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)FALSE);
	RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDONE);
	RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDZERO);

	if(doBloom)
		RenderBloom(cam, settings, params);

	// the quad covers the whole back buffer raster, the part outside the screen is clipped
	SetQuad(verts, cam, backWidth, backHeight, 1.0f, 1.0f, 255);

	if(FxaaOn){
		RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pBackBuffer);
		RenderQuadWithShader(MODERNFX_SHADER_FXAA, verts, params, 2);
	}

	if(doBloom){
		RwIm2DVertex bloomVerts[4];
		SetQuad(bloomVerts, cam, screenWidth, screenHeight, 1.0f, 1.0f, clamp(settings.bloomIntensity, 0.0f, 1.0f)*255);
		RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)TRUE);
		RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDONE);
		RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDONE);
		RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pBloomRaster[0]);
		RwIm2DRenderIndexedPrimitive(rwPRIMTYPETRILIST, bloomVerts, 4, Index, 6);
		RwRenderStateSet(rwRENDERSTATEVERTEXALPHAENABLE, (void*)FALSE);
		RwRenderStateSet(rwRENDERSTATESRCBLEND, (void*)rwBLENDONE);
		RwRenderStateSet(rwRENDERSTATEDESTBLEND, (void*)rwBLENDZERO);
	}

	if(doGrade){
		if(FxaaOn || doBloom)
			GetBackBuffer(cam);
		// c12/u_screenScale: back buffer texcoords -> 0..1 on screen
		params[2][0] = backWidth/screenWidth;
		params[2][1] = backHeight/screenHeight;
		params[2][2] = 0.0f;
		params[2][3] = 0.0f;
		// c13/u_gradeParams
		params[3][0] = settings.sharpen;
		params[3][1] = settings.contrast;
		params[3][2] = settings.vibrance;
		params[3][3] = settings.vignette;
		RwRenderStateSet(rwRENDERSTATETEXTURERASTER, pBackBuffer);
		RenderQuadWithShader(MODERNFX_SHADER_GRADE, verts, params, 4);
	}

	DefinedState();
	RwRenderStateSet(rwRENDERSTATETEXTURERASTER, nil);

	POP_RENDERGROUP();
}

#endif

int CPostFX::PrevRed[NUMAVERAGE], CPostFX::AvgRed;
int CPostFX::PrevGreen[NUMAVERAGE], CPostFX::AvgGreen;
int CPostFX::PrevBlue[NUMAVERAGE], CPostFX::AvgBlue;
int CPostFX::PrevAlpha[NUMAVERAGE], CPostFX::AvgAlpha;
int CPostFX::Next;
int CPostFX::NumValues;

// This is rather annoying...the blur color can flicker slightly
// which becomes very visible when amplified by the shader
void
CPostFX::SmoothColor(uint32 red, uint32 green, uint32 blue, uint32 alpha)
{
	PrevRed[Next] = red;
	PrevGreen[Next] = green;
	PrevBlue[Next] = blue;
	PrevAlpha[Next] = alpha;
	Next = (Next+1) % NUMAVERAGE;
	NumValues = Min(NumValues+1, NUMAVERAGE);

	AvgRed = 0;
	AvgGreen = 0;
	AvgBlue = 0;
	AvgAlpha = 0;
	for(int i = 0; i < NumValues; i++){
		AvgRed += PrevRed[i];
		AvgGreen += PrevGreen[i];
		AvgBlue += PrevBlue[i];
		AvgAlpha += PrevAlpha[i];
	}
	AvgRed /= NumValues;
	AvgGreen /= NumValues;
	AvgBlue /= NumValues;
	AvgAlpha /= NumValues;
}

#endif
