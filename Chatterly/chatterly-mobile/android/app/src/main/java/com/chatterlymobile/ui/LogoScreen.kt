package com.chatterlymobile.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chatterlymobile.R

@Composable
fun LogoScreen(modifier: Modifier = Modifier) {
    val brandColor = Color(0xFF221B4C)
    val backgroundColor = Color(0xFFF8F9FA)

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(backgroundColor),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Logo Container
        Box(
            modifier = Modifier
                .size(160.dp)
                .shadow(elevation = 8.dp, shape = RoundedCornerShape(40.dp))
                .background(Color.White, shape = RoundedCornerShape(40.dp)),
            contentAlignment = Alignment.Center
        ) {
            Image(
                painter = painterResource(id = R.drawable.ic_chat_bubble),
                contentDescription = null,
                modifier = Modifier.size(100.dp)
            )
        }

        Spacer(modifier = Modifier.height(32.dp))

        // App Name
        Text(
            text = stringResource(id = R.string.app_name),
            fontSize = 64.sp,
            fontWeight = FontWeight.Bold,
            color = brandColor,
            lineHeight = 72.sp
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Brand Name
        Text(
            text = stringResource(id = R.string.stackly_brand),
            fontSize = 20.sp,
            fontWeight = FontWeight.Normal,
            color = brandColor,
            letterSpacing = 2.sp
        )
    }
}

@Preview(showBackground = true)
@Composable
fun LogoScreenPreview() {
    MaterialTheme {
        LogoScreen()
    }
}
